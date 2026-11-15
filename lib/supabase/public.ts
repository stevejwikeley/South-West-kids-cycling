import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";


// A client that never carries the visitor's session: every request goes out
// with the anon key alone. Use it for data that is the same for everyone
// (the public calendar, clubs, spaces left on an event).
//
// Why not the cookie-based server client? It attaches the signed-in user's
// access token to every query, so if that token is ever rejected (expired,
// revoked, or refused by the Data API — as happened in production on
// 15 Nov 2026, PGRST303 on a freshly refreshed session) the *public* pages
// fail for that user and they get the global error screen. Public data has
// no reason to depend on who's looking.
export function createPublicClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } }
  );
}
