import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./types";
import { fetchWithAuthRetry } from "@/lib/auth-rejection";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // Retries the Data API's transient "JWT issued at future" refusal.
      global: { fetch: (input, init) => fetchWithAuthRetry(input, init) },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // called from a Server Component with no request context — safe to
            // ignore as long as middleware is refreshing the session
          }
        },
      },
    }
  );
}