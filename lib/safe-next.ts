// Only allow same-site relative paths as a post-login destination. Rejects
// "//evil.com", "/\evil.com" and "@evil.com" (which would turn
// `${origin}${next}` into https://site@evil.com).
export function safeNextPath(next: string | null | undefined, fallback = "/admin"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return fallback;
  }
  return next;
}

// Where a server action may send the user afterwards. Server action
// arguments bound in a Client Component (saveEvent.bind(null, redirectTo))
// are just values the browser sends back, so they're attacker-controlled;
// only ever redirect to one of the app's own dashboards.
const ACTION_REDIRECTS = ["/admin", "/admin/pending", "/organiser"] as const;

export function safeActionRedirect(redirectTo: unknown, fallback = "/"): string {
  return typeof redirectTo === "string" && (ACTION_REDIRECTS as readonly string[]).includes(redirectTo)
    ? redirectTo
    : fallback;
}
