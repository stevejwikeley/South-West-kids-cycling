"use server";

import { redirect } from "next/navigation";
import * as Sentry from "@sentry/nextjs";
import { createClient } from "@/lib/supabase/server";
import { toClub } from "@/lib/data";
import { parseClubForm } from "./parse-club-form";
import { researchClub, type ClubResearchResult } from "@/lib/club-research";
import type { Club } from "@/lib/types";
import type { ClubRow } from "@/lib/supabase/types";

export interface ClubFormState {
  error?: string;
  success?: boolean;
}

// redirectTo is null for the inline "+ Add new club" quick-add inside the
// event/series forms, which stays on the same page and reports success back
// to its caller instead of navigating away.
export async function saveClub(
  redirectTo: string | null,
  _prevState: ClubFormState,
  formData: FormData
): Promise<ClubFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const parsed = parseClubForm(formData);
  if (!parsed.ok) return { error: parsed.error };

  const id = String(formData.get("id") ?? "").trim() || null;

  if (id) {
    const { error } = await supabase.from("clubs").update(parsed.values).eq("id", id);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase.from("clubs").insert(parsed.values);
    if (error) return { error: error.message };
  }

  if (redirectTo) redirect(redirectTo);
  return { success: true };
}

export interface CreateClubResult {
  club?: Club;
  error?: string;
}

// Used by the "+ Add new club" quick-add inline in the event/series forms —
// same validation and insert as saveClub's create path, but called directly
// (not through useActionState) so the caller can grab the new club's id and
// select it immediately, without leaving the event form.
export async function createClub(formData: FormData): Promise<CreateClubResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const parsed = parseClubForm(formData);
  if (!parsed.ok) return { error: parsed.error };

  const { data, error } = await supabase.from("clubs").insert(parsed.values).select("*").single();
  if (error) return { error: error.message };

  return { club: toClub(data as ClubRow) };
}

export interface DeleteClubResult {
  error?: string;
}

export interface ClubResearchActionResult {
  result?: ClubResearchResult;
  error?: string;
}

// Not admin/organiser-gated at the RLS level (it doesn't write anything),
// but only ever called from the club quick-add UI, which itself only
// renders for a signed-in profile — still worth an explicit check here
// since a Server Action is a public HTTP endpoint regardless of what UI
// happens to call it.
export async function researchClubAction(name: string): Promise<ClubResearchActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const trimmed = name.trim();
  if (!trimmed) return { error: "Enter a club name first." };

  try {
    const result = await researchClub(trimmed);
    return { result };
  } catch (e) {
    Sentry.captureException(e, { tags: { operation: "research_club_action" } });
    return { error: "Lookup failed — try again, or fill in the details yourself." };
  }
}

export async function deleteClub(id: string): Promise<DeleteClubResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("clubs").delete().eq("id", id);
  if (error) return { error: error.message };
  return {};
}
