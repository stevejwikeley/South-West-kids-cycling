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
  const postcode = normalizePostcode(fields.postcode);
  if (!postcode) return null;

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
