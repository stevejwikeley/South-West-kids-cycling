import type { Region } from "@/lib/types";

const REGION_HINT: Record<Region, string | undefined> = {
  devon: "Devon",
  cornwall: "Cornwall",
  somerset: "Somerset",
  both: undefined,
};

interface LocatableEvent {
  venue: string;
  address: string | null;
  postcode: string | null;
  region: Region;
  lat: number | null;
  lng: number | null;
}

export function searchUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

// lat/lng (when geocoded) pins the exact spot regardless of how the venue
// text is worded. Without it, prefer venue + postcode over the full address —
// postcode alone is enough for Google to resolve a UK location precisely,
// and address is the noisiest re-extracted field (most prone to wording
// drift between scans), so leaving it out of the query avoids feeding that
// noise into the search. Full address only comes in as a last resort, when
// there's no postcode to lean on instead.
export function mapsQuery(e: LocatableEvent): string {
  if (e.lat != null && e.lng != null) return `${e.lat},${e.lng}`;
  if (e.postcode) return [e.venue, e.postcode, "UK"].filter(Boolean).join(", ");
  return [e.venue, e.address, e.postcode, REGION_HINT[e.region], "UK"].filter(Boolean).join(", ");
}

export function mapsUrl(e: LocatableEvent): string {
  return searchUrl(mapsQuery(e));
}

// Clubs only carry one free-text location string (no separate
// address/postcode/geocoding, unlike events) — a plain text search is the
// best we can do without adding club geocoding, which isn't in scope here.
export function clubMapsUrl(location: string): string {
  return searchUrl(`${location}, UK`);
}
