// Matches a free-text name (organiser_name, typed by a human or guessed by
// the extraction model) against the clubs table. Only an unambiguous
// case-insensitive exact match counts — a substring/fuzzy match risks
// silently attaching an event to the wrong club, which is worse than
// leaving club_id null for a human to set during review.
export function matchClubByName(
  name: string | null,
  clubs: { id: string; name: string }[]
): string | null {
  if (!name) return null;
  const needle = name.trim().toLowerCase();
  if (!needle) return null;
  const matches = clubs.filter((c) => c.name.trim().toLowerCase() === needle);
  return matches.length === 1 ? matches[0].id : null;
}
