// Basic SSRF guard shared by every path that fetches an admin- or
// publicly-supplied URL (admin ingest, the public submit-an-event page) —
// it's still our server making the request, so block obvious
// internal/private targets rather than trusting the caller's good faith.
export function assertPublicHttpUrl(raw: string): URL {
  const url = new URL(raw);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http/https URLs are supported.");
  }
  const host = url.hostname.toLowerCase();
  const isPrivate =
    host === "localhost" ||
    host === "0.0.0.0" ||
    host.endsWith(".local") ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) ||
    host === "::1";
  if (isPrivate) throw new Error("That URL points at a private/internal address.");
  return url;
}
