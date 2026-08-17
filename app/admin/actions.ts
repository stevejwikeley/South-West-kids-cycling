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

// Any admin can invite an organiser (unchanged from before); only
// super_admin can invite someone directly as an admin — enforced here
// server-side, not just by hiding the role option in the form, since a
// forged POST could otherwise set role=admin from a plain admin's session.
// The role is passed as invite metadata (see 0014_invite_role_metadata.sql)
// so the person lands with that role from their very first sign-in — no
// separate "upgrade an existing organiser" step needed.
export async function inviteTeamMember(
  _prevState: { error?: string; success?: string },
  formData: FormData
): Promise<{ error?: string; success?: string }> {
  const profile = await getCurrentProfile();
  if (!isAdminRole(profile)) {
    return { error: "Not authorised." };
  }

  const email = String(formData.get("email") ?? "").trim();
  const role = String(formData.get("role") ?? "organiser");
  if (!email) return { error: "Email is required." };
  if (role !== "admin" && role !== "organiser") return { error: "Invalid role." };
  if (role === "admin" && profile?.role !== "super_admin") {
    return { error: "Only a super admin can invite someone as an admin." };
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/auth/confirm?next=${role === "admin" ? "/admin" : "/organiser"}`,
    data: { role },
  });

  if (error) return { error: error.message };
  revalidatePath("/admin/team");
  return { success: `Invited ${email} as ${role === "admin" ? "an admin" : "an organiser"}.` };
}

// Only super_admin can create admins — a regular admin has every other
// capability admin already had, just not this one, so that a compromised or
// careless admin account can't mint more admins. Call-by-id (rather than
// the old email-lookup form) since the team table already has every
// existing organiser's id on hand.
export async function promoteToAdminById(userId: string): Promise<{ error?: string }> {
  const profile = await getCurrentProfile();
  if (profile?.role !== "super_admin") {
    return { error: "Not authorised." };
  }

  // profiles has no RLS policy permitting role updates (only admins reading
  // all rows, and each user reading their own) — same reason inviteTeamMember
  // above needs the service-role client rather than the RLS-bound one.
  const admin = createAdminClient();
  const { error } = await admin.from("profiles").update({ role: "admin" }).eq("id", userId).eq("role", "organiser");

  if (error) return { error: error.message };

  revalidatePath("/admin/team");
  return {};
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

  revalidatePath("/admin/team");
  return {};
}
