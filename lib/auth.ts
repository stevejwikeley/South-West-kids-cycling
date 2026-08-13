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
