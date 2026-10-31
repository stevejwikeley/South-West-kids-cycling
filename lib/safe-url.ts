// Normalise a user-supplied link to an absolute http(s) URL, or null if it
// can't be one. A bare "www.club.co.uk" gets https:// prepended (a common
// slip that would otherwise break the whole .ics feed — the ics library
// rejects any URL without a scheme); javascript:, data:, mailto: and other
// schemes are refused outright.
export function httpUrlOrNull(value: string | null | undefined): string | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  // Whitespace/control characters never belong in a link, and line breaks
  // in particular would let a value smuggle extra lines into the .ics feed.
  if (/[\s\u0000-\u001f\u007f]/.test(raw)) return null;

  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (!url.hostname.includes(".")) return null;
  if (url.username || url.password) return null;

  // Return what was typed (plus any added scheme) rather than url.toString(),
  // which appends a trailing slash and would make an unchanged link look
  // edited in the suggest-a-change diff.
  return withScheme;
}
