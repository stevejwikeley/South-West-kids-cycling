// Pure "has this re-scan found a real change?" check for saveCandidates()
// (save-candidates.ts) — no server imports, so it can be unit-tested
// directly (lib/live-diff.test.ts).
//
// title and venue_name are deliberately excluded — they're the two fields
// findDuplicate() (dedup.ts) already fuzzy-matched to decide this candidate
// IS the live event in the first place, so an exact-string difference here
// is expected extraction-wording noise (a dropped season year, a different
// dash, "Newnham Bottom" vs "Newnham Bottom Field"), not a real change.
// Comparing them here undid that entirely — every re-scan re-flagged the
// same event as "changed" purely because its own re-extracted title/venue
// text isn't byte-identical to what an earlier run produced.
//
// address is excluded for the same reason — it's free text re-extracted
// fresh every scan (a dropped comma, "Rd" vs "Road", differently-ordered
// clauses) and, unlike postcode, has no canonical form to normalize
// against.
//
// description is excluded too: it's AI-written prose, regenerated in
// different words on every scan, so it can never be compared — any two runs
// disagree. A re-scan that differs only in description is the same event.
import type { EventRow } from "@/lib/supabase/types";
import { normalizePostcode } from "../postcode.ts";
import { organiserSignal, venueNamesMatch, type DedupFields } from "./dedup-score.ts";

const COMPARISON_FIELDS = [
  "discipline", "status", "start_datetime",
  "postcode", "region", "age_categories", "kids_only",
  "booking_status", "booking_link", "organiser_url", "organiser_name", "organiser_contact",
] as const;

// Two postcodes closer than this are the same venue written two ways (a
// park with several postcodes, a neighbouring unit) — not a venue move.
const SAME_PLACE_METRES = 500;

export interface Coords {
  lat: number;
  lng: number;
}

function sameValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
  }
  return a === b;
}

function metresBetween(a: Coords, b: Coords): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(h));
}

// Organiser names drift between scans the same way titles do ("South West
// Cyclocross League" vs "South West Cyclocross League / Dartmoor Velo"), so
// they're compared with the same organiser check findDuplicate() uses. Only
// when that can't tell (no meaningful words on one side) does exact text
// decide.
function organiserChanged(candidate: Record<string, unknown>, live: EventRow): boolean {
  const asFields = (name: unknown, clubId: unknown) =>
    ({ organiser_name: name as string | null, club_id: (clubId as string | null) ?? null }) as DedupFields;
  const same = organiserSignal(
    asFields(candidate.organiser_name, candidate.club_id),
    asFields(live.organiser_name, live.club_id)
  );
  return same === null ? !sameValue(candidate.organiser_name, live.organiser_name) : !same;
}

// A different postcode string only counts as a change when it's a
// different place: measured by distance when both sides are geocoded,
// otherwise by whether the venue names still agree.
function postcodeChanged(candidate: Record<string, unknown>, live: EventRow, coords: Coords | null): boolean {
  if (normalizePostcode(candidate.postcode as string | null) === normalizePostcode(live.postcode)) return false;
  if (coords && live.lat !== null && live.lng !== null) {
    return metresBetween(coords, { lat: live.lat, lng: live.lng }) > SAME_PLACE_METRES;
  }
  return venueNamesMatch(candidate.venue_name as string | null, live.venue_name) !== true;
}

// A candidate field that's null/empty is "no opinion offered", not a
// diff — extraction not finding an address doesn't mean the live address
// changed. Only a populated field that actively disagrees with the live
// value counts as something worth surfacing.
export function candidateDiffersFromLive(values: Record<string, unknown>, live: EventRow, coords: Coords | null): boolean {
  const liveRecord = live as unknown as Record<string, unknown>;
  return COMPARISON_FIELDS.some((field) => {
    const v = values[field];
    if (v === null || v === undefined) return false;
    if (Array.isArray(v) && v.length === 0) return false;
    // start_datetime is built here as "...T00:00:00.000Z" but PostgREST
    // serializes the same instant back as "...T00:00:00+00:00" — confirmed
    // against live data. Comparing those strings with === always disagrees
    // even when the date hasn't changed, so this field alone re-flagged
    // every matched event as "changed" on every re-scan. Compare the
    // parsed instant instead.
    if (field === "start_datetime") {
      return new Date(v as string).getTime() !== new Date(liveRecord[field] as string).getTime();
    }
    if (field === "postcode") return postcodeChanged(values, live, coords);
    if (field === "organiser_name") return organiserChanged(values, live);
    return !sameValue(v, liveRecord[field]);
  });
}
