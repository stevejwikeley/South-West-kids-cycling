"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, isAdminRole } from "@/lib/auth";
import { checkWatchedSource } from "@/lib/ingestion/check-source";
import type { ProfileRow, WatchedSourceRow } from "@/lib/supabase/types";

export interface SourceActionResult {
  error?: string;
  success?: string;
}

export interface CheckNowResult {
  error?: string;
  status?: "ok" | "error";
  detail?: string;
}

const CHECK_FREQUENCIES = new Set(["nightly", "weekly"]);

async function requireAdmin(): Promise<ProfileRow> {
  const profile = await getCurrentProfile();
  if (!profile || !isAdminRole(profile)) throw new Error("Not authorised.");
  return profile;
}

function summarize(result: Awaited<ReturnType<typeof checkWatchedSource>>): string {
  if (result.status === "ok") {
    return result.found
      ? `Checked it now — found ${result.found} event${result.found === 1 ? "" : "s"} (${result.saved} new to the pending queue).`
      : "Checked it now — reachable, but no youth cycling events found on the page right now.";
  }
  return `Added, but the first check failed: ${result.error}`;
}

export async function addWatchedSource(
  _prevState: SourceActionResult,
  formData: FormData
): Promise<SourceActionResult> {
  let profile: ProfileRow;
  try {
    profile = await requireAdmin();
  } catch {
    return { error: "Not authorised." };
  }

  const label = String(formData.get("label") ?? "").trim();
  const url = String(formData.get("url") ?? "").trim();
  const checkFrequency = String(formData.get("check_frequency") ?? "nightly");

  if (!label) return { error: "Label is required." };
  if (!url) return { error: "URL is required." };
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { error: "Only http/https URLs are supported." };
    }
  } catch {
    return { error: "That doesn't look like a valid URL." };
  }
  if (!CHECK_FREQUENCIES.has(checkFrequency)) return { error: "Invalid check frequency." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("watched_sources")
    .insert({ label, url, check_frequency: checkFrequency, created_by: profile.id })
    .select("*")
    .single();

  if (error) return { error: error.message };

  // Check immediately rather than making the admin wait for the nightly cron
  // to find out whether the site even allows automated fetching.
  const result = await checkWatchedSource(supabase, data as WatchedSourceRow);
  return { success: `Added "${label}". ${summarize(result)}` };
}

export async function checkWatchedSourceNow(id: string): Promise<CheckNowResult> {
  try {
    await requireAdmin();
  } catch {
    return { error: "Not authorised." };
  }

  const supabase = await createClient();
  const { data, error: fetchError } = await supabase.from("watched_sources").select("*").eq("id", id).single();
  if (fetchError || !data) return { error: "Source not found." };

  const result = await checkWatchedSource(supabase, data as WatchedSourceRow);
  return { status: result.status, detail: summarize(result) };
}

export async function deleteWatchedSource(id: string): Promise<SourceActionResult> {
  let profile: ProfileRow;
  try {
    profile = await requireAdmin();
  } catch {
    return { error: "Not authorised." };
  }

  const supabase = await createClient();

  // Checked explicitly (not just left to RLS) so a blocked delete surfaces a
  // clear message instead of silently affecting zero rows — RLS enforces
  // this same rule at the database level (0015_watched_source_created_by.sql)
  // regardless of what this check does, it's just the source of the
  // human-readable error.
  if (profile.role !== "super_admin") {
    const { data: existing, error: fetchError } = await supabase.from("watched_sources").select("created_by").eq("id", id).single();
    if (fetchError || !existing) return { error: "Source not found." };
    if (existing.created_by !== profile.id) {
      return { error: "You can only remove sources you added yourself." };
    }
  }

  const { error } = await supabase.from("watched_sources").delete().eq("id", id);
  if (error) return { error: error.message };

  return { success: "Removed." };
}
