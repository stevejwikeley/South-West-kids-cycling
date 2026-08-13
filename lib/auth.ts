import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { ProfileRow } from "@/lib/supabase/types";

// Memoized per-request (React cache()) — the root layout and individual
// pages both need "is this an admin?" now, and without this they'd each
// trigger their own auth.getUser() + profiles lookup on every request.
export const getCurrentProfile = cache(async (): Promise<ProfileRow | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  return data as ProfileRow | null;
});

// super_admin has every admin capability plus the ability to promote/demote
// other admins, so any check that used to be `role === "admin"` should use
// this instead — the one place that must stay super_admin-only is the
// promote/demote actions themselves.
export function isAdminRole(profile: ProfileRow | null): boolean {
  return profile?.role === "admin" || profile?.role === "super_admin";
}
