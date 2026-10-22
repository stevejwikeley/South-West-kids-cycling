// What a pending candidate needs before it can go live without a human
// looking at it. Shared by the manual approve button (which refuses with
// the same list) and the auto-publish path in saveCandidates, so "enough
// data to publish" means one thing everywhere.

// The fields a new event can't be published without — the calendar card,
// the detail page and the booking CTA all assume these are set.
export const REQUIRED_FOR_NEW_EVENT = ["title", "discipline", "start_datetime", "venue_name", "region", "organiser_url"] as const;

export interface PublishCandidate {
  duplicate_of?: string | null;
  field_flags?: Record<string, string> | null;
  kind?: string | null;
  club_id?: string | null;
  [key: string]: unknown;
}

// Every reason this candidate can't be published as-is. An empty list means
// it's ready.
export function missingForPublish(row: PublishCandidate): string[] {
  if (row.duplicate_of) return [];
  const missing: string[] = REQUIRED_FOR_NEW_EVENT.filter((key) => {
    const v = row[key];
    return v === null || v === undefined || v === "";
  });
  // Mirrors the training_requires_club DB constraint.
  if (row.kind === "training" && !row.club_id) missing.push("club");
  return missing;
}

// Whether a candidate can skip the review queue entirely. A new event only
// needs its required fields — any "needs verification" flags travel onto
// the live row for an admin to check later, and there's no existing data
// for an uncertain field to clobber. An update to a live event is held back
// whenever any field is flagged, since merging an uncertain value would
// overwrite something an admin may already have corrected.
export function canAutoPublish(row: PublishCandidate): boolean {
  if (row.duplicate_of) return !row.field_flags || Object.keys(row.field_flags).length === 0;
  return missingForPublish(row).length === 0;
}
