import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { findDuplicate } from "./dedup";
import { bookingLinkTitleMismatch, LINK_TITLE_MISMATCH_FLAG } from "./link-check";
import { normalizePostcode } from "@/lib/postcode";
import type { ExtractedEvent } from "./extract-events";
import type { Database, EventRow, EventPendingRow, SourceTypeEnum } from "@/lib/supabase/types";

// Shared by the admin "paste URL/text" flow, the nightly watched-source
// cron, and the public submit-an-event page — one save path so dedup
// behaves identically everywhere. sourceType only affects how the pending
// row is labeled (and which rows count as "already queued, don't duplicate"
// below) — the insert/dedup/approve mechanics are otherwise identical for
// smart_ingest and public_submission.
export async function saveCandidates(
  supabase: SupabaseClient<Database>,
  candidates: ExtractedEvent[],
  rawSourceRef: string,
  sourceUrl?: string,
  watchedSourceId?: string,
  sourceType: SourceTypeEnum = "smart_ingest"
): Promise<number> {
  const [{ data: liveEvents, error: liveError }, { data: pendingRows, error: pendingError }] = await Promise.all([
    supabase.from("events").select("*"),
    supabase.from("events_pending").select("*").in("source_type", ["smart_ingest", "public_submission"]),
  ]);
  if (liveError) throw new Error(liveError.message);
  if (pendingError) throw new Error(pendingError.message);

  const liveIds = new Set(((liveEvents as EventRow[]) ?? []).map((e) => e.id));

  // Already-queued smart_ingest candidates are dupe-checked the same way as
  // live events, so re-scanning a watched source before its last batch is
  // reviewed doesn't flood the queue with the same event every night.
  const pendingAsEvents = ((pendingRows as EventPendingRow[]) ?? []).filter(
    (p) => p.title && p.start_datetime && p.venue_name
  ) as unknown as EventRow[];

  const comparisonPool = [...((liveEvents as EventRow[]) ?? []), ...pendingAsEvents];

  let saved = 0;
  for (const candidate of candidates) {
    const duplicate = await findDuplicate(candidate, comparisonPool);
    // A match against another pending row just means "already queued, don't
    // insert again" — only a match against a *live* event should be recorded
    // as duplicate_of (merge target on approval).
    if (duplicate && !liveIds.has(duplicate.id)) continue;

    const flags: Record<string, string> = Object.fromEntries(
      candidate.low_confidence_fields.map((f) => [f, "needs verification"])
    );
    // A code-verified signal, so it overrides a generic "needs verification"
    // the extraction model may have already put on this field.
    if (bookingLinkTitleMismatch(candidate.title, candidate.booking_link)) {
      flags.booking_link = LINK_TITLE_MISMATCH_FLAG;
    }
    const fieldFlags = Object.keys(flags).length ? flags : null;

    const values = {
      title: candidate.title,
      discipline: candidate.discipline,
      status: candidate.status ?? "confirmed",
      start_datetime: candidate.date ? `${candidate.date}T00:00:00.000Z` : null,
      venue_name: candidate.venue_name,
      address: candidate.address,
      postcode: normalizePostcode(candidate.postcode),
      region: candidate.region,
      age_categories: candidate.age_categories,
      kids_only: candidate.kids_only,
      booking_status: candidate.booking_status,
      booking_link: candidate.booking_link,
      // organiser_url is required to publish (it's the CTA while a booking
      // link isn't live yet) but posters/pasted text rarely state one. When
      // the source itself was a URL, that page is a reasonable fallback —
      // it's genuinely "the organiser's own site" for a scraped listing.
      organiser_url: candidate.organiser_url ?? sourceUrl ?? null,
      organiser_name: candidate.organiser_name,
      organiser_contact: candidate.organiser_contact,
    };

    // A re-scan that matches a live event and agrees with it on everything
    // it has an opinion about isn't a change worth reviewing again — even
    // when the extraction is uncertain about a field once more (field
    // flags below), re-queuing something an admin already approved just
    // makes them re-check the same answer twice.
    //
    // Diffed against the raw candidate fields, not `values` — status and
    // organiser_url get a fallback default (?? "confirmed", ?? sourceUrl)
    // applied above for the insert, and candidateDiffersFromLive's
    // null-means-no-opinion check only works before that default is
    // applied. Diffing `values` instead meant a candidate that extracted
    // no organiser_url at all (common — most source pages don't state
    // one) silently became "organiser_url = sourceUrl", which then
    // disagreed with the live event's real organiser_url (near-always
    // admin-corrected away from the raw watched-source page, since that
    // page is rarely the organiser's own site) — re-flagging the same
    // already-approved event as changed on every weekly check.
    const diffCandidate = { ...values, status: candidate.status, organiser_url: candidate.organiser_url };
    if (duplicate && liveIds.has(duplicate.id) && !candidateDiffersFromLive(diffCandidate, duplicate)) {
      continue;
    }

    const { error } = await supabase.from("events_pending").insert({
      ...values,
      source_type: sourceType,
      source_detail: rawSourceRef,
      raw_source_ref: rawSourceRef,
      extraction_confidence: candidate.confidence,
      duplicate_of: duplicate?.id ?? null,
      field_flags: fieldFlags,
      watched_source_id: watchedSourceId ?? null,
    });

    if (!error) saved++;
  }

  return saved;
}

// title and venue_name are deliberately excluded — they're the two fields
// findDuplicate() (dedup.ts) already fuzzy-matched to decide this candidate
// IS the live event in the first place, so an exact-string difference here
// is expected extraction-wording noise (a dropped season year, a different
// dash, "Newnham Bottom" vs "Newnham Bottom Field"), not a real change.
// Comparing them here undid that entirely — every re-scan re-flagged the
// same event as "changed" purely because its own re-extracted title/venue
// text isn't byte-identical to what an earlier run produced.
//
// address is excluded for the same reason — it's free text re-extracted
// fresh every scan (a dropped comma, "Rd" vs "Road", differently-ordered
// clauses) and, unlike postcode, has no canonical form to normalize
// against. postcode carries the location precision that actually matters
// (it's what geocoding keys off), so it stays in the list.
const COMPARISON_FIELDS = [
  "discipline", "status", "start_datetime",
  "postcode", "region", "age_categories", "kids_only",
  "booking_status", "booking_link", "organiser_url", "organiser_name", "organiser_contact",
] as const;

function sameValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
  }
  return a === b;
}

// A candidate field that's null/empty is "no opinion offered", not a
// diff — extraction not finding an address doesn't mean the live address
// changed. Only a populated field that actively disagrees with the live
// value counts as something worth surfacing.
function candidateDiffersFromLive(values: Record<string, unknown>, live: EventRow): boolean {
  const liveRecord = live as unknown as Record<string, unknown>;
  return COMPARISON_FIELDS.some((field) => {
    const v = values[field];
    if (v === null || v === undefined) return false;
    if (Array.isArray(v) && v.length === 0) return false;
    // start_datetime is built here as "...T00:00:00.000Z" but PostgREST
    // serializes the same instant back as "...T00:00:00+00:00" — confirmed
    // against live data. Comparing those strings with === always disagrees
    // even when the date hasn't changed, so this field alone re-flagged
    // every matched event as "changed" on every re-scan. Compare the
    // parsed instant instead.
    if (field === "start_datetime") {
      return new Date(v as string).getTime() !== new Date(liveRecord[field] as string).getTime();
    }
    // Guards against live rows saved before postcode normalization existed —
    // compare canonical forms so old-format live data doesn't itself look
    // like a diff against a freshly-normalized candidate.
    if (field === "postcode") {
      return normalizePostcode(v as string | null) !== normalizePostcode(liveRecord[field] as string | null);
    }
    return !sameValue(v, liveRecord[field]);
  });
}
