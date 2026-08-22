// UK postcodes are re-extracted from free text on every watched-source
// re-scan, so casing and spacing drift between runs ("ex1 1aa" vs "EX1
// 1AA") even when the postcode itself hasn't changed. Canonicalizing before
// storage/comparison stops that drift from tripping the sync diff check,
// and gives geocode.ts a consistently-formatted string to look up.
export function normalizePostcode(postcode: string | null | undefined): string | null {
  if (!postcode) return null;
  const compact = postcode.replace(/\s+/g, "").toUpperCase();
  if (compact.length < 5) return compact || null;
  return `${compact.slice(0, -3)} ${compact.slice(-3)}`;
}
