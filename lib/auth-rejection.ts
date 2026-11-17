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
// different machines, and from 15 Nov 2026 some Data API machines ran seconds
// behind: a token minted a moment earlier was refused with PGRST303 "JWT
// issued at future". The refusal happens before the query runs, so retrying
// the same request is safe, and it clears within seconds (or on another
// machine). Wrapping fetch retries every session query at once instead of
// patching each caller. Only that exact refusal is retried: an expired or
// revoked token (also PGRST30x) fails straight away.
export function isFutureTokenRefusal(status: number, body: { code?: string; message?: string } | null): boolean {
  return status === 401 && body?.code === "PGRST303" && /issued at future/i.test(body?.message ?? "");
}

type RetryOptions = { attempts?: number; delayMs?: number; sleep?: (ms: number) => Promise<void>; doFetch?: typeof fetch };

export async function fetchWithAuthRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
  { attempts = 5, delayMs = 1000, sleep = (ms) => new Promise<void>((r) => setTimeout(r, ms)), doFetch = fetch }: RetryOptions = {}
): Promise<Response> {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  // Only the Data API, and only requests that can be sent again (supabase-js
  // sends string bodies, never streams).
  const replayable = url.includes("/rest/v1/") && (init?.body == null || typeof init.body === "string");
  let res = await doFetch(input, init);
  for (let i = 1; replayable && i < attempts && res.status === 401; i++) {
    let body: { code?: string; message?: string } | null = null;
    try { body = await res.clone().json(); } catch { /* not JSON: not our refusal */ }
    if (!isFutureTokenRefusal(res.status, body)) break;
    await sleep(delayMs * i);
    res = await doFetch(input, init);
  }
  return res;
}