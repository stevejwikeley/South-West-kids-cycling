export function searchUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

// Only ever links when there's a postcode-geocoded coordinate (see
// lib/geocode.ts for why postcode is the only trusted source) — no
// text-search fallback built from venue/address. Guessing from raw
// re-extracted text got real events pinned at the wrong place more than
// once (a same-named venue miles away, a different landmark entirely), and
// a confidently-wrong pin is worse than no map link at all.
export function mapsUrl(e: { lat: number | null; lng: number | null }): string | null {
  if (e.lat == null || e.lng == null) return null;
  return searchUrl(`${e.lat},${e.lng}`);
}

// Clubs are unaffected by the above — a club's `location` is a plain
// town/area name entered directly (not re-extracted from a source page
// every week, and not fine-grained enough to collide with a same-named
// venue elsewhere), so a live Google search on it is safe and unambiguous.
export function clubMapsUrl(location: string): string {
  return searchUrl(`${location}, UK`);
}
