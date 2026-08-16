import "server-only";
import { tokenize, similarity } from "./dedup";

// Guards against a specific real-world failure: two near-identical source
// pages (e.g. British Cycling event listings) with generic per-row "VIEW
// EVENT" link text let the extraction step mis-pair a link with the wrong
// neighbouring event when their titles are near-duplicates of each other
// (observed live: "SWXC Round 5 (XCO...)" was extracted with the booking
// link for "SWCX - Womens & Youth Coaching"). extract-events.ts already
// instructs the model to match links by position rather than link text, but
// that isn't foolproof for titles this close together. Comparing the title
// against the booking link's own URL slug catches a swap like that: the two
// titles above share zero tokens even though the strings look superficially
// alike.
const MIN_SLUG_TOKENS = 2;
const MISMATCH_THRESHOLD = 0.12;

export const LINK_TITLE_MISMATCH_FLAG =
  "Booking link doesn't appear to match this event's title — double-check before approving";

function slugText(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const segments = parsed.pathname.split("/").filter(Boolean);
  if (segments.length === 0) return null;
  // The longest path segment is the best guess at a descriptive slug,
  // rather than a route prefix like "events"/"details" or a bare numeric id.
  const longest = segments.reduce((a, b) => (b.length > a.length ? b : a));
  try {
    return decodeURIComponent(longest).replace(/[-_+]/g, " ");
  } catch {
    return longest.replace(/[-_+]/g, " ");
  }
}

// Only fires on a confident non-match against a genuinely descriptive slug
// — a missing/generic/numeric-only slug (a bare homepage, an id-only path)
// says nothing about the event, so it's left unflagged rather than guessed.
export function bookingLinkTitleMismatch(title: string, bookingLink: string | null): boolean {
  if (!bookingLink) return false;
  const text = slugText(bookingLink);
  if (!text) return false;
  const tokens = tokenize(text);
  if (tokens.size < MIN_SLUG_TOKENS) return false;
  if ([...tokens].every((t) => /^\d+$/.test(t))) return false;
  return similarity(title, text) < MISMATCH_THRESHOLD;
}
