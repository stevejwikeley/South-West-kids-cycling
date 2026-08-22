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

// Fallback for the common case of a watched source stating a venue/address
// with no postcode at all — postcodes.io can't help there since it only
// looks up postcodes it already knows, not free text. LocationIQ does
// free-text forward geocoding (OpenStreetMap-backed), same shape of query
// as the Maps search link this replaces. Optional: skipped entirely (not
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

// Postcode first (precise, free, no key); free-text venue/address/region
// fallback only when there's no usable postcode to look up. Returns null
// rather than throwing either way — geocoding is a nice-to-have for map
// accuracy, never a reason to block saving/approving an event.
export async function geocodeLocation(fields: {
  venue_name: string | null;
  address: string | null;
  postcode: string | null;
  region: string | null;
}): Promise<Coordinates | null> {
  const postcode = normalizePostcode(fields.postcode);
  if (postcode) {
    const coords = await geocodePostcode(postcode);
    if (coords) return coords;
  }

  // "UK" is a query-quality hint, not a location itself — appending it
  // unconditionally would mean an event with no venue/address/postcode at
  // all still geocoded to a real result: the literal string "UK", which
  // resolves to the country's centroid rather than correctly returning
  // "nothing to geocode here".
  const parts = [fields.venue_name, fields.address, postcode].filter(Boolean);
  if (parts.length === 0) return null;
  return geocodeFreeText([...parts, "UK"].join(", "));
}
