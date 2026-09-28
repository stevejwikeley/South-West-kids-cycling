"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EVENT_FORM_FIELDS, parseEventForm, type EventFormValues } from "./parse-event-form";
import type { EventPendingRow, EventRow } from "@/lib/supabase/types";

export interface SuggestChangeState {
  error?: string;
  success?: boolean;
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

export interface ApproveChangeResult {
  error?: string;
}

function sameField(key: string, a: unknown, b: unknown): boolean {
  // Postgres hands timestamps back as "…+00:00" while forms produce "…Z";
  // compare those as instants rather than strings.
  if ((key === "start_datetime" || key === "end_datetime") && typeof a === "string" && typeof b === "string") {
    return new Date(a).getTime() === new Date(b).getTime();
  }
  return sameValue(a, b);
}

export async function approveChange(pendingId: string, redirectTo: string): Promise<ApproveChangeResult> {
  const supabase = await createClient();

  const { data: pending, error: fetchError } = await supabase
    .from("events_pending")
    .select("*")
    .eq("id", pendingId)
    .single();
  if (fetchError || !pending) return { error: "Pending change not found — it may already have been handled." };

  const row = pending as EventPendingRow;
  if (!row.duplicate_of || !row.diff_against) return { error: "This pending row isn't a change request." };

  const { data: current, error: eventError } = await supabase
    .from("events")
    .select("*")
    .eq("id", row.duplicate_of)
    .single();
  if (eventError || !current) return { error: "The event this change targets no longer exists. Reject it instead." };
  const currentRow = current as EventRow;

  // Only allowlisted form fields are ever applied, and only if the event
  // hasn't been edited since the suggestion was made — otherwise approving
  // would silently revert that later edit.
  const diff = row.diff_against as Diff;
  const update: Partial<EventRow> = {};
  const conflicts: string[] = [];
  EVENT_FORM_FIELDS.forEach((key) => {
    const change = diff[key];
    if (!change || typeof change !== "object" || !("to" in change)) return;
    const now = currentRow[key];
    if (sameField(key, now, change.to)) return; // already applied
    if (!sameField(key, now, change.from)) {
      conflicts.push(key);
      return;
    }
    (update as Record<string, unknown>)[key] = change.to;
  });

  if (conflicts.length > 0) {
    return {
      error: `The event has been edited since this was suggested (${conflicts.join(", ")}). Update the event by hand if needed, then reject this suggestion.`,
    };
  }

  // Claim the pending row by deleting it first: if two approvals race, only
  // one gets the row back and the other stops here instead of applying twice.
  const { data: claimed, error: claimError } = await supabase
    .from("events_pending")
    .delete()
    .eq("id", pendingId)
    .select();
  if (claimError) return { error: claimError.message };
  if (!claimed || claimed.length === 0) return { error: "This change has already been handled." };

  if (Object.keys(update).length > 0) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error: updateError } = await supabase
      .from("events")
      .update({ ...update, updated_by: user?.id })
      .eq("id", row.duplicate_of);

    if (updateError) {
      // Put the suggestion back so it isn't lost.
      await supabase.from("events_pending").insert({ ...(claimed[0] as EventPendingRow) });
      return { error: updateError.message };
    }
  }

  redirect(redirectTo);
}

export async function rejectChange(pendingId: string, redirectTo: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("events_pending").delete().eq("id", pendingId);
  if (error) throw new Error(error.message);
  redirect(redirectTo);
}
