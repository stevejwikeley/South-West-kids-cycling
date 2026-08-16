import type { EventRow } from "@/lib/supabase/types";
import type { ExtractedEvent } from "./extract-events";
import { pickSameEvent } from "./match-duplicate";

// Shared dedup check used regardless of source — spec section 7.2: "runs
// through one shared dedup check (title + venue + date proximity against
// live events) before landing in the queue".
//
// Title/venue text drifts between re-extractions of the very same source —
// an LLM re-reading a page doesn't reproduce identical wording every run
// (observed in practice: "SWCX League 2026/27 Round 1 – Torbay Velopark"
// one check, "SWCX League Round 1 - Torbay Velopark" the next — a dropped
// season-year qualifier and a different dash character). Substring
// containment breaks the moment either title has a word the other doesn't,
// so a previously-exact-matching source can start re-queuing its own
// already-published events on every check. Token-set similarity (Dice
// coefficient) tolerates that kind of drift; a genuinely ambiguous case
// (date matches, similarity is inconclusive either way) escalates to a
// single bounded LLM call rather than guessing.
const DATE_PROXIMITY_DAYS = 3;
const CONFIDENT_SCORE = 0.55;
const AMBIGUOUS_FLOOR = 0.25;
const MAX_LLM_CANDIDATES = 3;

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").trim();
}

export function tokenize(s: string): Set<string> {
  return new Set(normalize(s).split(/\s+/).filter(Boolean));
}

// Symmetric and tolerant of one title being a trimmed/reworded version of
// the other — unlike substring containment, which fails the moment either
// title has an infix (a dropped or added word) the other doesn't.
export function similarity(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return (2 * shared) / (ta.size + tb.size);
}

// Guards the one failure mode token-overlap alone can't catch: two entries
// in the same numbered series ("Round 1" vs "Round 2") can share almost
// every other word. If both titles name a round and the numbers disagree,
// it's never a match, regardless of similarity score.
function roundNumbersConflict(a: string, b: string): boolean {
  const ra = a.match(/round\s*(\d+)/i)?.[1];
  const rb = b.match(/round\s*(\d+)/i)?.[1];
  return !!ra && !!rb && ra !== rb;
}

function daysBetween(a: string, b: string): number {
  const diff = Math.abs(new Date(a).getTime() - new Date(b).getTime());
  return diff / (1000 * 60 * 60 * 24);
}

export async function findDuplicate(candidate: ExtractedEvent, liveEvents: EventRow[]): Promise<EventRow | null> {
  if (!candidate.date) return null;

  const ambiguous: { event: EventRow; score: number }[] = [];

  for (const event of liveEvents) {
    const eventDate = event.start_datetime.slice(0, 10);
    if (daysBetween(candidate.date, eventDate) > DATE_PROXIMITY_DAYS) continue;
    if (roundNumbersConflict(candidate.title, event.title)) continue;

    const titleScore = similarity(candidate.title, event.title);
    const venueScore = candidate.venue_name ? similarity(candidate.venue_name, event.venue_name) : 1;

    if (titleScore >= CONFIDENT_SCORE && venueScore >= CONFIDENT_SCORE) return event;
    if (titleScore >= AMBIGUOUS_FLOOR) ambiguous.push({ event, score: titleScore });
  }

  if (ambiguous.length === 0) return null;

  const shortlist = ambiguous
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_LLM_CANDIDATES)
    .map((c) => c.event);

  return pickSameEvent(candidate, shortlist);
}
