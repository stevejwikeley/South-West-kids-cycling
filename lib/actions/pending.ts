"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { parseEventForm, type EventFormValues } from "./parse-event-form";
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

export async function approveChange(pendingId: string, redirectTo: string) {
  const supabase = await createClient();

  const { data: pending, error: fetchError } = await supabase
    .from("events_pending")
    .select("*")
    .eq("id", pendingId)
    .single();
  if (fetchError || !pending) throw new Error("Pending change not found.");

  const row = pending as EventPendingRow;
  if (!row.duplicate_of || !row.diff_against) throw new Error("This pending row isn't a change request.");

  const diff = row.diff_against as Diff;
  const update: Partial<EventRow> = {};
  (Object.keys(diff) as (keyof Diff)[]).forEach((key) => {
    if (key === "_note") return;
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
  if (updateError) throw new Error(updateError.message);

  await supabase.from("events_pending").delete().eq("id", pendingId);
  redirect(redirectTo);
}

export async function rejectChange(pendingId: string, redirectTo: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("events_pending").delete().eq("id", pendingId);
  if (error) throw new Error(error.message);
  redirect(redirectTo);
}
