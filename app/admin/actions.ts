"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentProfile, isAdminRole } from "@/lib/auth";

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
  if (!isAdminRole(profile)) {
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

// Only super_admin can create admins — a regular admin has every other
// capability admin already had, just not this one, so that a compromised or
// careless admin account can't mint more admins.
export async function promoteToAdmin(
  _prevState: { error?: string; success?: string },
  formData: FormData
): Promise<{ error?: string; success?: string }> {
  const profile = await getCurrentProfile();
  if (profile?.role !== "super_admin") {
    return { error: "Not authorised." };
  }

  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Email is required." };

  // profiles has no RLS policy permitting role updates (only admins reading
  // all rows, and each user reading their own) — same reason inviteOrganiser
  // above needs the service-role client rather than the RLS-bound one.
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .update({ role: "admin" })
    .eq("email", email)
    .eq("role", "organiser")
    .select("id")
    .maybeSingle();

  if (error) return { error: error.message };
  if (!data) return { error: `No organiser account found for ${email}.` };

  revalidatePath("/admin");
  return { success: `${email} is now an admin.` };
}

// super_admin rows are never touched here — the eq("role", "admin") guard
// means this can only ever demote a plain admin back to organiser.
export async function demoteToOrganiser(userId: string): Promise<{ error?: string }> {
  const profile = await getCurrentProfile();
  if (profile?.role !== "super_admin") {
    return { error: "Not authorised." };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("profiles").update({ role: "organiser" }).eq("id", userId).eq("role", "admin");

  if (error) return { error: error.message };

  revalidatePath("/admin");
  return {};
}
