"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";

export interface SourceActionResult {
  error?: string;
  success?: string;
}

const CHECK_FREQUENCIES = new Set(["nightly", "weekly"]);

async function requireAdmin() {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "admin") throw new Error("Not authorised.");
}

export async function addWatchedSource(
  _prevState: SourceActionResult,
  formData: FormData
): Promise<SourceActionResult> {
  try {
    await requireAdmin();
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
  const { error } = await supabase.from("watched_sources").insert({
    label,
    url,
    check_frequency: checkFrequency,
  });

  if (error) return { error: error.message };
  return { success: `Added "${label}" — it'll be picked up on the next scan.` };
}

export async function deleteWatchedSource(id: string, redirectTo: string): Promise<SourceActionResult> {
  try {
    await requireAdmin();
  } catch {
    return { error: "Not authorised." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("watched_sources").delete().eq("id", id);
  if (error) return { error: error.message };

  redirect(redirectTo);
}
