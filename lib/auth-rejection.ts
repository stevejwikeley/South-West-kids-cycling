// PostgREST's JWT errors (PGRST301-303) and a bare 401 mean "the session's
// token was refused", not "the row doesn't exist" — callers use this to fall
// back to the public, session-free view instead of failing.
export function isAuthRejection(
  error: { code?: string | null; status?: number } | null | undefined
): boolean {
  if (!error) return false;
  return error.status === 401 || /^PGRST30\d$/.test(error.code ?? "");
}
