// Fills location gaps on an ingested candidate from things we already know,
// rather than leaving every candidate postcode-less for a human to look up.
// Pure (no server imports) so it can be unit-tested — the postcodes.io call
// lives in geocode.ts and its result is passed in.
//
// geocode.ts only trusts a postcode to place a pin, so a postcode is what
// unlocks the map for an event. Most sources never state one, but the same
// handful of venues come round again and again (every SWCX round at Newnham,
// every Wheal Velocity session at the clubhouse). An earlier, admin-approved
// event at that venue is a far better source than any free-text geocoder.

import { venueNamesMatch } from "./dedup-score.ts";
import type { RegionType } from "@/lib/supabase/types";

export interface KnownVenue {
  venue_name: string;
  postcode: string;
  address: string | null;
  region: RegionType | null;
  club_id: string | null;
}

export interface LocationFields {
  venue_name: string | null;
  address: string | null;
  postcode: string | null;
  region: RegionType | null;
  club_id: string | null;
  kind: string | null;
}

// Words that identify a kind of place, not which place. "Saltash School"
// and "Tavistock School" must not share a postcode because both say
// "school".
const GENERIC_VENUE_WORDS = new Set([
  "park", "field", "fields", "school", "college", "centre", "center", "common", "woods", "wood",
  "forest", "bike", "track", "trail", "trails", "clubhouse", "club", "house", "hall", "farm",
  "top", "bottom", "airfield", "showground", "leisure", "sports", "national", "trust",
]);

function distinctive(venue: string): boolean {
  return words(venue).some((t) => t.length > 2 && !GENERIC_VENUE_WORDS.has(t));
}

function words(venue: string): string[] {
  return venue.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

// A one-word venue ("Tavistock", "Exeter") is usually just the town, which
// "Tavistock College" or "Exeter Bike Park" would otherwise match — so
// one-word names only match exactly.
function sameVenue(a: string, b: string): boolean {
  const wa = words(a);
  const wb = words(b);
  if (wa.length === 1 || wb.length === 1) return wa.join(" ") === wb.join(" ");
  return venueNamesMatch(a, b) === true;
}

function samePostcode(a: string, b: string): boolean {
  return a.replace(/\s+/g, "").toUpperCase() === b.replace(/\s+/g, "").toUpperCase();
}

// Only returns a venue when every matching earlier event agrees on the
// postcode — two earlier events at "Newnham" with different postcodes
// (different fields of the same estate) means we can't say which.
function unanimous(matches: KnownVenue[]): KnownVenue | null {
  if (matches.length === 0) return null;
  return matches.every((m) => samePostcode(m.postcode, matches[0].postcode)) ? matches[0] : null;
}

export function findKnownVenue(c: LocationFields, known: KnownVenue[]): KnownVenue | null {
  if (c.venue_name) {
    if (!distinctive(c.venue_name)) return null;
    return unanimous(known.filter((k) => distinctive(k.venue_name) && sameVenue(c.venue_name!, k.venue_name)));
  }
  // No venue at all: a club's own training is almost always at its usual
  // venue, so borrow that — but only when the club has just the one.
  if (c.club_id && c.kind === "training") {
    return unanimous(known.filter((k) => k.club_id === c.club_id));
  }
  return null;
}

// Subset of a postcodes.io /postcodes/:pc result.
export interface PostcodeLookup {
  admin_county: string | null;
  admin_district: string | null;
}

const DEVON_UNITARIES = new Set(["Plymouth", "Torbay"]);
const SOMERSET_DISTRICTS = new Set(["Somerset", "North Somerset", "Bath and North East Somerset"]);

export function regionFromPostcode(lookup: PostcodeLookup): RegionType | null {
  const district = lookup.admin_district ?? "";
  if (district === "Cornwall" || district === "Isles of Scilly") return "cornwall";
  if (lookup.admin_county === "Devon" || DEVON_UNITARIES.has(district)) return "devon";
  if (lookup.admin_county === "Somerset" || SOMERSET_DISTRICTS.has(district)) return "somerset";
  if (district === "Bristol, City of") return "bristol";
  return null;
}

export interface EnrichResult {
  values: LocationFields;
  // Field flags to set; a null value means "clear this flag, code verified it".
  flags: Record<string, string | null>;
}

// Step 1 — borrow from a known venue. Never overwrites a value the source
// itself stated.
export function borrowFromKnownVenue(c: LocationFields, known: KnownVenue[]): EnrichResult {
  if (c.postcode) return { values: c, flags: {} };
  const venue = findKnownVenue(c, known);
  if (!venue) return { values: c, flags: {} };

  const flags: Record<string, string | null> = {
    postcode: `taken from an earlier event at "${venue.venue_name}" — check it's the same site`,
  };
  const values = { ...c, postcode: venue.postcode, address: c.address ?? venue.address, region: c.region ?? venue.region };
  if (!c.venue_name) {
    values.venue_name = venue.venue_name;
    flags.venue_name = "club's usual venue — source didn't say where";
  }
  return { values, flags };
}

// Step 2 — check whatever postcode we now have against postcodes.io.
// `lookup` is null when the postcode didn't resolve.
export function checkPostcode(c: LocationFields, lookup: PostcodeLookup | null): EnrichResult {
  if (!c.postcode) return { values: c, flags: {} };
  if (!lookup) return { values: c, flags: { postcode: "not a recognised UK postcode — check it" } };

  const region = regionFromPostcode(lookup);
  if (!region) {
    return { values: c, flags: { postcode: `postcode is in ${lookup.admin_district ?? "an unknown area"}, outside the calendar's regions` } };
  }
  if (!c.region) return { values: { ...c, region }, flags: { region: null } };
  // "both" (Devon & Cornwall) is consistent with either.
  if (c.region === region || (c.region === "both" && (region === "devon" || region === "cornwall"))) {
    return { values: c, flags: { region: null } };
  }
  return { values: c, flags: { region: `postcode is in ${region}, not ${c.region}` } };
}
