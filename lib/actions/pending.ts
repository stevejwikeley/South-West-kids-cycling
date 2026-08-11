"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { parseEventForm, type EventFormValues } from "./parse-event-form";
import { parsePendingForm, type PendingFormValues } from "./parse-pending-form";
import type { EventPendingRow, EventRow } from "@/lib/supabase/types";

export interface SuggestChangeState {
  error?: string;
  success?: boolean;
}

export interface PendingActionResult {
  error?: string;
}

type Diff = Partial<Record<keyof EventFormValues | "_note", { from: unknown; to: unknown }>>;

// events_pending accepts inserts from anyone, unauthenticated, so a diff
// blob could in principle be crafted by hand (not just via submitChangeRequest)
// to name columns the public form never exposes — approved, created_by,
// source_type, etc. Applying only known EventFormValues keys on approval
// means such a row can't touch anything beyond what the legitimate form
// could have produced, regardless of what's actually stored in the diff.
const ALLOWED_DIFF_KEYS = new Set<keyof EventFormValues>([
  "title",
  "discipline",
  "status",
  "all_day",
  "start_datetime",
  "end_datetime",
  "venue_name",
  "address",
  "postcode",
  "region",
  "age_categories",
  "kids_only",
  "booking_status",
  "booking_link",
  "organiser_url",
  "organiser_name",
  "organiser_contact",
]);

function sameValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
  }
  return a === b;
}

export async function submitChangeRequest(
  eventId: string,
  _prevState: SuggestChangeState,
  formData: FormData
): Promise<SuggestChangeState> {
  const supabase = await createClient();

  const { data: current, error: fetchError } = await supabase
    .from("events")
    .select("*")
    .eq("id", eventId)
    .single();
  if (fetchError || !current) return { error: "Event not found." };

  const parsed = parseEventForm(formData);
  if (!parsed.ok) return { error: parsed.error };

  const currentRow = current as EventRow;
  const diff: Diff = {};
  (Object.keys(parsed.values) as (keyof EventFormValues)[]).forEach((key) => {
    const to = parsed.values[key];
    const from = currentRow[key];
    if (!sameValue(to, from)) diff[key] = { from, to };
  });

  const note = String(formData.get("note") ?? "").trim();
  if (note) diff._note = { from: null, to: note };

  if (Object.keys(diff).length === 0) {
    return { error: "No changes detected — nothing to submit." };
  }

  const { error } = await supabase.from("events_pending").insert({
    title: currentRow.title,
    duplicate_of: eventId,
    source_type: "change_request",
    diff_against: diff,
  });

  if (error) return { error: error.message };
  return { success: true };
}

// These action functions return { error } rather than throwing — a thrown
// error from a directly-invoked (non-<form>) server action surfaces to the
// browser as a raw failed POST. They also don't redirect() server-side on
// success: that relied on the client router cache picking up the mutation,
// which it didn't reliably do (see the watched-sources "Remove" fix) — the
// caller navigates/refreshes itself after seeing a clean result instead.

export async function approveChange(pendingId: string): Promise<PendingActionResult> {
  const supabase = await createClient();

  const { data: pending, error: fetchError } = await supabase
    .from("events_pending")
    .select("*")
    .eq("id", pendingId)
    .single();
  if (fetchError || !pending) return { error: "Pending change not found." };

  const row = pending as EventPendingRow;
  if (!row.duplicate_of || !row.diff_against) return { error: "This pending row isn't a change request." };

  const diff = row.diff_against as Diff;
  const update: Partial<EventRow> = {};
  (Object.keys(diff) as (keyof Diff)[]).forEach((key) => {
    if (!ALLOWED_DIFF_KEYS.has(key as keyof EventFormValues)) return;
    const change = diff[key];
    if (change) (update as Record<string, unknown>)[key] = change.to;
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error: updateError } = await supabase
    .from("events")
    .update({ ...update, updated_by: user?.id })
    .eq("id", row.duplicate_of);
  if (updateError) return { error: updateError.message };

  await supabase.from("events_pending").delete().eq("id", pendingId);
  return {};
}

export async function rejectChange(pendingId: string): Promise<PendingActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("events_pending").delete().eq("id", pendingId);
  if (error) return { error: error.message };
  return {};
}

// Smart-ingested candidates carry their event fields directly on the pending
// row (not as a diff) — approving either merges them into the matched live
// event (when the dedup check found one) or inserts a brand-new event.
export async function approveIngested(pendingId: string): Promise<PendingActionResult> {
  const supabase = await createClient();

  const { data: pending, error: fetchError } = await supabase
    .from("events_pending")
    .select("*")
    .eq("id", pendingId)
    .single();
  if (fetchError || !pending) return { error: "Pending item not found." };

  const row = pending as EventPendingRow;
  if (row.source_type !== "smart_ingest") return { error: "This pending row isn't a smart-ingested candidate." };

  const values: Record<string, unknown> = {};
  ALLOWED_DIFF_KEYS.forEach((key) => {
    const v = (row as unknown as Record<string, unknown>)[key];
    // Skip null/undefined so DB defaults apply on insert, and so a field the
    // extraction wasn't confident about doesn't clobber good live data on
    // merge — same "don't overwrite with uncertainty" spirit as spec 4.2.
    if (v !== undefined && v !== null) values[key] = v;
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (row.duplicate_of) {
    const { error } = await supabase
      .from("events")
      .update({ ...values, updated_by: user?.id })
      .eq("id", row.duplicate_of);
    if (error) return { error: error.message };
  } else {
    const required: (keyof EventFormValues)[] = ["title", "discipline", "start_datetime", "venue_name", "region", "organiser_url"];
    const missing = required.filter((key) => values[key] === null || values[key] === undefined || values[key] === "");
    if (missing.length > 0) {
      return { error: `Can't approve as a new event — missing: ${missing.join(", ")}. Reject and add it manually via the event form instead.` };
    }

    const { error } = await supabase.from("events").insert({
      ...values,
      approved: true,
      source_type: "smart_ingest",
      published_via: "reviewed",
      created_by: user?.id ?? null,
      updated_by: user?.id ?? null,
    });
    if (error) return { error: error.message };
  }

  await supabase.from("events_pending").delete().eq("id", pendingId);
  return {};
}

// Edits a pending row before approval — from the slide-out panel, not the
// public suggest-a-change form, so it's admin-gated rather than open. A
// smart_ingest row is updated directly (its fields ARE the event data); a
// change_request row has its diff rebuilt against the live event it targets,
// same comparison submitChangeRequest itself uses, so only fields that
// actually differ from the live event stay in the diff.
export async function updatePending(pendingId: string, formData: FormData): Promise<PendingActionResult> {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "admin") return { error: "Not authorised." };

  const supabase = await createClient();
  const { data: pending, error: fetchError } = await supabase
    .from("events_pending")
    .select("*")
    .eq("id", pendingId)
    .single();
  if (fetchError || !pending) return { error: "Pending item not found." };

  const row = pending as EventPendingRow;
  const values = parsePendingForm(formData);

  if (row.source_type === "smart_ingest") {
    const { error } = await supabase.from("events_pending").update({ ...values }).eq("id", pendingId);
    if (error) return { error: error.message };
    return {};
  }

  if (!row.duplicate_of) return { error: "This pending row isn't editable." };

  const { data: liveEvent, error: liveError } = await supabase
    .from("events")
    .select("*")
    .eq("id", row.duplicate_of)
    .single();
  if (liveError || !liveEvent) return { error: "The event this change targets no longer exists." };

  const currentRow = liveEvent as EventRow;
  const diff: Diff = {};
  (Object.keys(values) as (keyof PendingFormValues)[]).forEach((key) => {
    if (!ALLOWED_DIFF_KEYS.has(key as keyof EventFormValues)) return;
    const to = values[key];
    const from = currentRow[key as keyof EventRow];
    if (!sameValue(to, from)) diff[key as keyof EventFormValues] = { from, to };
  });

  const existingNote = (row.diff_against as Diff | null)?._note;
  if (existingNote) diff._note = existingNote;

  const { error } = await supabase.from("events_pending").update({ title: values.title, diff_against: diff }).eq("id", pendingId);
  if (error) return { error: error.message };
  return {};
}
