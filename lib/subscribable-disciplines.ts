import { EVENT_DISCIPLINES, eventDisc } from "./mock-data.ts";
import type { Discipline, DisciplineId } from "./types.ts";

// Chip set for the two *standing-feed* builders — /subscribe and the embed
// builder — as distinct from lib/visible-disciplines.ts's
// visibleDisciplinesFor, which is correct for the live calendar page but
// wrong here. Do not merge these two back into one function; that is exactly
// the regression this file fixes (see commit 3237578 and its revert).
//
// The calendar's chips only ever filter what's rendered on screen right now,
// so tracking live data exactly is correct there: a discipline with no event
// currently in view has nothing to filter, so omitting its chip loses
// nothing, and a discipline the calendar has never heard of but which is
// genuinely present must still get a chip (that's what visibleDisciplinesFor
// guarantees).
//
// /subscribe and the embed builder instead build a feed URL that someone
// pastes into a calendar app or their own website and keeps for months or
// years. If its chip set tracked live data the same way, a discipline that
// simply has no upcoming event today (every currently-scheduled XC race has
// already lapsed into the past, say) would vanish from the builder entirely
// — nobody could construct an XC feed until a new XC race happened to
// appear, and any feed someone already built with `discipline=xc` would just
// silently never include the next one either. So: start from the full
// curated EVENT_DISCIPLINES list, which is always offered regardless of
// what's scheduled this week, then union in any discipline that is
// genuinely present in the data but not yet in that curated list — that
// second half is the legitimate part of the finding behind 3237578: an
// unrecognised-but-live discipline (the exact bug class behind the
// 2026-09-13 outage) must still be reachable here too, just not at the
// expense of the curated ones.
//
// Callers are responsible for excluding "training" (see app/subscribe/page.tsx
// and app/embed-builder/page.tsx) — that's a policy choice specific to those
// two surfaces (training has its own dedicated control), not something this
// general-purpose list-builder should bake in.
export function subscribableDisciplinesFor(disciplineIds: DisciplineId[]): Discipline[] {
  const present = [...new Set(disciplineIds)];
  const unknown = present.filter((id) => !EVENT_DISCIPLINES.some((d) => d.id === id)).map(eventDisc);
  return [...EVENT_DISCIPLINES, ...unknown];
}
