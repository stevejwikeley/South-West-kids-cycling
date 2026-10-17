import type { EventRow } from "@/lib/supabase/types";
import type { ExtractedEvent } from "./extract-events";
import { pickSameEvent } from "./match-duplicate";
import { assessMatch, type DedupFields } from "./dedup-score";

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
//
// Matching weighs name, organiser, venue and date together (see
// dedup-score.ts) — dates and venues do change, so neither alone can rule a
// match in or out.
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

export function eventToDedupFields(e: EventRow): DedupFields {
  return {
    title: e.title,
    date: e.start_datetime ? e.start_datetime.slice(0, 10) : null,
    venue_name: e.venue_name,
    postcode: e.postcode,
    organiser_name: e.organiser_name,
    club_id: e.club_id,
    kind: e.kind,
  };
}

export function candidateToDedupFields(c: ExtractedEvent): DedupFields {
  return {
    title: c.title,
    date: c.date,
    venue_name: c.venue_name,
    postcode: c.postcode,
    organiser_name: c.organiser_name,
    club_id: c.club_id,
    kind: c.kind,
  };
}

export async function findDuplicate(candidate: ExtractedEvent, pool: EventRow[]): Promise<EventRow | null> {
  const fields = candidateToDedupFields(candidate);
  const ambiguous: { event: EventRow; score: number }[] = [];
  const reschedules: { event: EventRow; score: number }[] = [];

  for (const event of pool) {
    const { verdict, score } = assessMatch(fields, eventToDedupFields(event));
    if (verdict === "match") return event;
    if (verdict === "maybe") ambiguous.push({ event, score });
    if (verdict === "reschedule") reschedules.push({ event, score });
  }

  // A moved date only reads as a postponement when exactly one event of
  // that name/organiser sits nearby. Several means it's a recurring series
  // and this candidate is simply another date in it.
  const rescheduleDates = new Set(reschedules.map((r) => r.event.start_datetime?.slice(0, 10)));
  if (rescheduleDates.size === 1) ambiguous.push(...reschedules);

  if (ambiguous.length === 0) return null;

  const shortlist = ambiguous
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_LLM_CANDIDATES)
    .map((c) => c.event);

  return pickSameEvent(candidate, shortlist);
}
