"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentProfile } from "@/lib/auth";

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function inviteOrganiser(
  _prevState: { error?: string; success?: string },
  formData: FormData
): Promise<{ error?: string; success?: string }> {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "admin") {
    return { error: "Not authorised." };
  }

  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Email is required." };

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/auth/confirm?next=/organiser`,
  });

  if (error) return { error: error.message };
  return { success: `Invited ${email}.` };
}
