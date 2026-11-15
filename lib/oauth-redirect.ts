// Kept free of "server-only" and other imports so it runs directly under
// node --test, like the other lib tests.

// Where /oauth/authorize may send an authorization code (or an error).
// Without a list, anyone could craft an authorize link with their own
// redirect_uri and PKCE challenge: if the passcode holder typed it in, the
// code went to the attacker, who could swap it for the token (which is
// MCP_SECRET). The GET handler's error redirect was an open redirect too.
// claude.ai's connector callback lives on these hosts; localhost covers
// MCP Inspector and other local clients. Extra hosts can be added with
// MCP_OAUTH_REDIRECT_HOSTS (comma-separated, https only).
const DEFAULT_REDIRECT_HOSTS = ["claude.ai", "claude.com"];

export function isAllowedRedirectUri(value: string | null | undefined): boolean {
  if (!value) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.username || url.password) return false;
  if (url.protocol === "http:") {
    return url.hostname === "localhost" || url.hostname === "127.0.0.1";
  }
  if (url.protocol !== "https:") return false;
  const extra = (process.env.MCP_OAUTH_REDIRECT_HOSTS ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  return [...DEFAULT_REDIRECT_HOSTS, ...extra].includes(url.hostname.toLowerCase());
}
