"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, isAdminRole } from "@/lib/auth";
import { parseEventForm, type EventFormValues } from "./parse-event-form";
import { parsePendingForm, type PendingFormValues } from "./parse-pending-form";
import { geocodeLocation } from "@/lib/geocode";
import { PUBLIC_DIFF_KEYS, ADMIN_DIFF_KEYS } from "@/lib/pending-diff-keys";
import { publishPendingRow } from "@/lib/ingestion/publish-candidate";
import type { EventPendingRow, EventRow } from "@/lib/supabase/types";

export interface SuggestChangeState {
  error?: string;
  success?: boolean;
}

export interface PendingActionResult {
  error?: string;
}

type Diff = Partial<Record<keyof EventFormValues | "_note", { from: unknown; to: unknown }>>;


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
    if (!PUBLIC_DIFF_KEYS.has(key)) return;
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

// No auth check — suggest-a-change is public (same as submitChangeRequest
// above), and the calendar page's slide-out panel only has the
// display-oriented CalendarEvent shape, so it needs the full EventRow to
// populate SuggestChangeForm.
export async function getEventForSuggestChange(id: string): Promise<EventRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("events").select("*").eq("id", id).single();
  if (error) return null;
  return data as EventRow;
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
    if (!ADMIN_DIFF_KEYS.has(key as keyof EventFormValues)) return;
    const change = diff[key];
    if (change) (update as Record<string, unknown>)[key] = change.to;
  });

  // Only worth touching lat/lng when postcode is part of what's actually
  // changing here, not on every unrelated change request. A change that
  // clears the postcode clears the now-unverifiable pin along with it,
  // rather than leaving a stale one behind.
  if ("postcode" in update) {
    if (update.postcode) {
      const coords = await geocodeLocation({ postcode: update.postcode });
      if (coords) {
        update.lat = coords.lat;
        update.lng = coords.lng;
      }
    } else {
      update.lat = null;
      update.lng = null;
    }
  }

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
  // public_submission rows (the public "submit an event" page) carry their
  // fields directly too, same as smart_ingest — both go through
  // saveCandidates, so they share this approval path.
  if (row.source_type !== "smart_ingest" && row.source_type !== "public_submission") {
    return { error: "This pending row isn't a smart-ingested or publicly-submitted candidate." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return publishPendingRow(supabase, row, "reviewed", user?.id ?? null);
}

// Edits a pending row before approval — from the slide-out panel, not the
// public suggest-a-change form, so it's admin-gated rather than open. A
// smart_ingest row is updated directly (its fields ARE the event data); a
// change_request row has its diff rebuilt against the live event it targets,
// same comparison submitChangeRequest itself uses, so only fields that
// actually differ from the live event stay in the diff.
export async function updatePending(pendingId: string, formData: FormData): Promise<PendingActionResult> {
  const profile = await getCurrentProfile();
  if (!isAdminRole(profile)) return { error: "Not authorised." };

  const supabase = await createClient();
  const { data: pending, error: fetchError } = await supabase
    .from("events_pending")
    .select("*")
    .eq("id", pendingId)
    .single();
  if (fetchError || !pending) return { error: "Pending item not found." };

  const row = pending as EventPendingRow;
  const values = parsePendingForm(formData);

  if (row.source_type === "smart_ingest" || row.source_type === "public_submission") {
    // Marks this candidate as having needed a human correction before it was
    // fit to publish — the input to the watched_source's correction_rate,
    // computed at approval time (see approveIngested). public_submission
    // rows have no watched_source_id, so this is a no-op for them there,
    // but the field itself is still meaningful admin-side metadata.
    const { error } = await supabase.from("events_pending").update({ ...values, was_edited: true }).eq("id", pendingId);
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
    if (!ADMIN_DIFF_KEYS.has(key as keyof EventFormValues)) return;
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
