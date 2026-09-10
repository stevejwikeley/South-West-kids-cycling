"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, isAdminRole } from "@/lib/auth";
import { generateEventDescription, type GenerateDescriptionResult } from "@/lib/event-description";
import type { EventRow } from "@/lib/supabase/types";

// Not auth-gated — used by the public /submit-event structured form too,
// same as club research is only gated by which UI happens to call it. It
// only ever reads the URL the caller themselves supplied.
export async function generateDescriptionAction(url: string, title: string, venueName: string): Promise<GenerateDescriptionResult> {
  if (!url.trim()) return { error: "Enter an organiser URL first." };
  return generateEventDescription(url, title, venueName);
}

export type EventMissingDescription = Pick<EventRow, "id" | "title" | "organiser_url" | "venue_name">;

// Feeds the admin-only backfill panel (components/admin/BackfillDescriptions.tsx)
// — every live event with no description yet, oldest first so a partial
// backfill run resumes roughly where an earlier one left off.
export async function getEventsMissingDescriptions(): Promise<EventMissingDescription[]> {
  const profile = await getCurrentProfile();
  if (!isAdminRole(profile)) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("events")
    .select("id, title, organiser_url, venue_name")
    .is("description", null)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data as EventMissingDescription[];
}

export interface UpdateDescriptionResult {
  error?: string;
}

export async function updateEventDescription(id: string, description: string): Promise<UpdateDescriptionResult> {
  const profile = await getCurrentProfile();
  if (!isAdminRole(profile)) return { error: "Not authorised." };

  const supabase = await createClient();
  const { error } = await supabase.from("events").update({ description }).eq("id", id);
  if (error) return { error: error.message };
  return {};
}
