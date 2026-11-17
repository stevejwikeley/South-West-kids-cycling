// PostgREST's JWT errors (PGRST301-303) and a bare 401 mean "the session's
// token was refused", not "the row doesn't exist" — callers use this to fall
// back to the public, session-free view instead of failing.
export function isAuthRejection(
  error: { code?: string | null; status?: number } | null | undefined
): boolean {
  if (!error) return false;
  return error.status === 401 || /^PGRST30\d$/.test(error.code ?? "");
}

// Supabase issues the session token (Auth) and checks it (the Data API) on
// different machines, and on 17 Nov 2026 the Data API's clock ran a few
// seconds behind: a token minted a moment earlier was refused with PGRST303
// "JWT issued at future". The admin layout read that as "not signed in" and
// bounced a user who had just signed in back to /login. The refusal clears by
// itself within seconds, so retry a few times before believing it.
type MaybeRefused = { error: { code?: string | null } | null; status?: number };

export async function retryWhileTokenFresh<T extends MaybeRefused>(
  run: () => PromiseLike<T>,
  { attempts = 4, delayMs = 1500, sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)) } = {}
): Promise<T> {
  let result = await run();
  for (let i = 1; i < attempts && isAuthRejection({ code: result.error?.code, status: result.status }); i++) {
    await sleep(delayMs);
    result = await run();
  }
  return result;
}
