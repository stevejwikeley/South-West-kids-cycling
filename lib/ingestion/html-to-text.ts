// Light HTML-to-text conversion for pasted URLs — good enough for an LLM to
// read; no need for a full DOM parser since Claude tolerates messy input.
// Anchor hrefs are preserved inline as "link text (URL)" — a listing page
// with a per-row "View event" CTA is otherwise indistinguishable from plain
// text with no way to tell which link belongs to which row.
export function htmlToText(html: string, baseUrl?: string): string {
  // Nav/header/footer chrome (menus, footers) routinely carries dozens of
  // links of its own — stripped before link-preservation runs, or a page
  // with no <main> (common) buries the actual content's links under noise.
  const withoutChrome = html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(nav|header|footer)[^>]*>[\s\S]*?<\/\1>/gi, " ");

  const withLinks = withoutChrome.replace(
    /<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
    (_match, href: string, inner: string) => {
      const innerText = inner.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (!innerText) return "";
      let resolved = href;
      if (baseUrl) {
        try {
          resolved = new URL(href, baseUrl).toString();
        } catch {
          // leave href as-is if it's not resolvable (e.g. "javascript:...", "#")
        }
      }
      return `${innerText} (${resolved}) `;
    }
  );

  return withLinks
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const URL_RE = /^https?:\/\/\S+$/i;

export function isLikelyUrl(input: string): boolean {
  return URL_RE.test(input.trim());
}
