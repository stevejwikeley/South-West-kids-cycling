import "server-only";
import { normalizePostcode } from "@/lib/postcode";

export interface Coordinates {
  lat: number;
  lng: number;
}

// postcodes.io is free, keyless, and authoritative for real UK postcodes —
// tried first so the common case (a source page states a proper postcode)
// never touches a rate-limited third-party key. Fails open (null) on any
// network hiccup or unrecognised postcode; a missing pin is a silent
// fallback to the existing text-search Maps link, not an ingestion error.
async function geocodePostcode(postcode: string): Promise<Coordinates | null> {
  try {
    const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(postcode.replace(/\s+/g, ""))}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (json.status !== 200 || !json.result) return null;
    return { lat: json.result.latitude, lng: json.result.longitude };
  } catch {
    return null;
  }
}

// Free-text forward geocoding (OpenStreetMap-backed), same shape of query as
// the Maps search link this replaces. Unlike a bare postcode lookup, this
// can resolve to a named place itself (a bike park, a showground) rather
// than just the postcode's own centroid — the two are often hundreds of
// metres apart for an unaddressed rural venue, since the postcode usually
// belongs to the nearest actual dwelling. Optional: skipped entirely (not
// an error) when LOCATIONIQ_API_KEY isn't configured.
async function geocodeFreeText(query: string): Promise<Coordinates | null> {
  const key = process.env.LOCATIONIQ_API_KEY;
  if (!key) return null;
  try {
    const url = `https://us1.locationiq.com/v1/search?key=${key}&q=${encodeURIComponent(query)}&format=json&countrycodes=gb&limit=1`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const results = await res.json();
    const top = Array.isArray(results) ? results[0] : null;
    if (!top) return null;
    const lat = Number(top.lat);
    const lng = Number(top.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}

function kmBetween(a: Coordinates, b: Coordinates): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// Confirmed against a real case: "Old Hill Bike Park" (postcode PL30 3EF)
// geocoded via postcode alone landed ~700m off, at the postcode's own
// centroid rather than the bike park itself — while a free-text search for
// the venue name found it as a named OpenStreetMap feature, precisely
// placed. So a named-venue match is preferred over the bare postcode
// whenever we have one; the postcode lookup still runs, but now purely as
// a sanity check, and as the fallback when free text finds nothing.
// SANITY_RADIUS_KM guards against a free-text mismatch (a same-named venue
// elsewhere in the country, or an unrelated match for a generic name like
// "The Track") — if it lands further from the postcode than any real venue
// reasonably would, that's a sign the match is wrong, not that the venue is
// unusually large, so fall back to the safer postcode centroid instead.
const SANITY_RADIUS_KM = 5;

// Postcode is still tried unconditionally (cheap, free, no key) so there's
// always a fallback/sanity-check point even when there's no venue name or
// no LocationIQ key configured. Returns null rather than throwing either
// way — geocoding is a nice-to-have for map accuracy, never a reason to
// block saving/approving an event.
export async function geocodeLocation(fields: {
  venue_name: string | null;
  address: string | null;
  postcode: string | null;
  region: string | null;
}): Promise<Coordinates | null> {
  const postcode = normalizePostcode(fields.postcode);

  // "UK" is a query-quality hint, not a location itself — appending it
  // unconditionally would mean an event with no venue/address/postcode at
  // all still geocoded to a real result: the literal string "UK", which
  // resolves to the country's centroid rather than correctly returning
  // "nothing to geocode here".
  const parts = [fields.venue_name, fields.address, postcode].filter(Boolean);
  const [postcodeCoords, textCoords] = await Promise.all([
    postcode ? geocodePostcode(postcode) : Promise.resolve(null),
    parts.length > 0 ? geocodeFreeText([...parts, "UK"].join(", ")) : Promise.resolve(null),
  ]);

  if (textCoords && (!postcodeCoords || kmBetween(textCoords, postcodeCoords) <= SANITY_RADIUS_KM)) {
    return textCoords;
  }
  return postcodeCoords;
}
