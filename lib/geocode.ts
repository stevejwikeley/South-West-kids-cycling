import "server-only";
import { normalizePostcode } from "@/lib/postcode";

export interface Coordinates {
  lat: number;
  lng: number;
}

// Postcode is the only geocoding input trusted here. Free-text venue/address
// matching (tried via LocationIQ) got real events wrong in production more
// than once — "Escot Park" matched a same-named "Park" 15km away in Exeter
// because its address field ("nr Exeter") threw the search off, and "Haldon
// Heroic" matched a different landmark over a mile from the actual venue.
// An LLM-extracted venue name or address has no guarantee of being
// unambiguous, and a free-text geocoder will confidently return *a* result
// rather than admitting it doesn't really know which one is right. A
// postcode is structured and unambiguous — it either resolves to a real
// location or fails outright, no silent wrong guesses — so it's the only
// signal allowed to produce a pin. No postcode means no pin, not a guess.
export async function geocodeLocation(fields: { postcode: string | null }): Promise<Coordinates | null> {
  const result = await lookupPostcode(fields.postcode);
  return result && result !== "not_found" ? { lat: result.lat, lng: result.lng } : null;
}

export interface PostcodeResult extends Coordinates {
  admin_county: string | null;
  admin_district: string | null;
}

// Same lookup, plus the council area — ingestion uses it to check (or fill)
// an event's region from its postcode. "not_found" means postcodes.io says
// the postcode doesn't exist; null means we couldn't ask (no postcode,
// network error, timeout) — callers must not treat that as invalid.
export async function lookupPostcode(raw: string | null): Promise<PostcodeResult | "not_found" | null> {
  const postcode = normalizePostcode(raw);
  if (!postcode) return null;

  try {
    const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(postcode.replace(/\s+/g, ""))}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (res.status === 404) return "not_found";
    if (!res.ok) return null;
    const json = await res.json();
    if (json.status !== 200 || !json.result) return null;
    return {
      lat: json.result.latitude,
      lng: json.result.longitude,
      admin_county: json.result.admin_county ?? null,
      admin_district: json.result.admin_district ?? null,
    };
  } catch {
    return null;
  }
}
