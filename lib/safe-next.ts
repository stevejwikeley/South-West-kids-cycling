// Only allow same-site relative paths as a post-login destination. Rejects
// "//evil.com", "/\evil.com" and "@evil.com" (which would turn
// `${origin}${next}` into https://site@evil.com).
export function safeNextPath(next: string | null | undefined, fallback = "/admin"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return fallback;
  }
  return next;
}
