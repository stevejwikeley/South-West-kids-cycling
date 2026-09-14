import type { ClubDisciplineId, Discipline, DisciplineId } from "./types";

// Finding B (enumeration-fix-2 review): TypeScript can check a
// `Record<Union, T>` for exhaustiveness against a union type, but it cannot
// check an array literal the same way — nothing stopped EVENT_DISCIPLINES
// from silently falling behind DisciplineId. That's the mechanism behind the
// outage this file already documents below: DisciplineId (or the live enum)
// gains a value, EVENT_DISCIPLINES doesn't, and every caller that trusted
// EVENT_DISCIPLINES as the exhaustive list — most importantly
// app/calendar.ics/route.ts's DISCIPLINE_VALUES — silently drops the filter
// for that value instead of erroring.
//
// AssertCovers closes that gap at compile time without changing
// EVENT_DISCIPLINES' shape (still a plain, ordered array — ordering here is
// load-bearing, see visibleDisciplinesFor) or its runtime behaviour:
//   - `as const satisfies readonly Discipline[]` keeps each entry's `id`
//     narrowed to its own string literal instead of widened to `string`,
//     without losing the structural check against Discipline.
//   - `EventDisciplineIds` reads back the union of ids actually present in
//     the array literal.
//   - `Exclude<DisciplineId, EventDisciplineIds>` is then the set of
//     DisciplineId members with *no* entry above — normally `never`.
//   - `AssertCovers<Missing extends never>` demands its argument extend
//     `never`. Delete an entry (or add a member to DisciplineId alone) and
//     `Missing` stops being `never` — TypeScript then reports the deleted/
//     added id by name (e.g. "Type 'coaching' does not satisfy the
//     constraint 'never'"), right where `_EventDisciplinesCoverAllIds` is
//     declared below. Nothing needs to run for this to fire; `tsc --noEmit`
//     catches it the moment the two lists disagree.
type AssertCovers<Missing extends never> = Missing;

export const EVENT_DISCIPLINES = [
  { id: "cx", label: "Cyclocross", color: "#E0102A" },
  { id: "xc", label: "XC", color: "#1F5D3A" },
  { id: "road", label: "Road", color: "#1D3A6B" },
  { id: "tri", label: "Triathlon", color: "#0E7C86" },
  { id: "gravel", label: "Gravel", color: "#8B5E34" },
  { id: "duathlon", label: "Duathlon", color: "#A6446E" },
  { id: "clusters", label: "Cluster session", color: "#B8860B" },
  // Olive/yellow-green — hue ~82°, at least 39° from every neighbouring
  // colour above and below (clusters' gold at 43°, xc's green at 146°), so
  // it reads as its own colour rather than a near-miss of either.
  { id: "coaching", label: "Coaching session", color: "#5C7A29" },
  { id: "training", label: "Training", color: "#6B6B66" },
  { id: "other", label: "Other", color: "#6A3F86" },
] as const satisfies readonly Discipline[];

type EventDisciplineIds = (typeof EVENT_DISCIPLINES)[number]["id"];
// Referenced only by the compiler — its existence, not its value, is the
// guard. See AssertCovers above for what breaks (and how) if this stops
// being valid.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _EventDisciplinesCoverAllIds = AssertCovers<Exclude<DisciplineId, EventDisciplineIds>>;

// Muted grey, deliberately distinct from every colour in EVENT_DISCIPLINES /
// CLUB_DISCIPLINES below (including #6B6B66, already claimed by the real
// "training" entry) — see fallbackDiscipline for why this exists.
const FALLBACK_COLOR = "#9C9C94";

// Turns a raw enum value into a readable label: "future_discipline-xyz" ->
// "Future Discipline Xyz".
function humanize(id: string): string {
  return id
    .replace(/[-_]+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase()) || id;
}

// `discipline`/club-discipline columns are database enums that can gain a
// new value (via migration) before this deployment's code knows about it —
// that's exactly what took the site down: a `.find(...)!` on an id absent
// from the list returned undefined, and the caller's `.color` read threw,
// 500ing every page that renders an event. An unrecognised id must degrade
// to a neutral, labelled chip instead of crashing the page.
function fallbackDiscipline(id: string): Discipline {
  return { id: id as DisciplineId, label: humanize(id), color: FALLBACK_COLOR };
}

export const eventDisc = (id: DisciplineId): Discipline =>
  EVENT_DISCIPLINES.find((d) => d.id === id) ?? fallbackDiscipline(id);
export const ageLabel = (id: string) => id.toUpperCase();

export const CLUB_DISCIPLINES = [
  { id: "road", label: "Road", color: "#1D3A6B" },
  { id: "xc", label: "XC / MTB", color: "#1F5D3A" },
  { id: "cx", label: "Cyclocross", color: "#E0102A" },
] as const satisfies readonly Discipline[];

// Same guard as _EventDisciplinesCoverAllIds above, for the club-discipline
// enum (ClubDisciplineId / the DB's club_discipline_type) instead of the
// event one.
type ClubDisciplineIds = (typeof CLUB_DISCIPLINES)[number]["id"];
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _ClubDisciplinesCoverAllIds = AssertCovers<Exclude<ClubDisciplineId, ClubDisciplineIds>>;

export const clubDisc = (id: string): Discipline =>
  CLUB_DISCIPLINES.find((d) => d.id === id) ?? fallbackDiscipline(id);
