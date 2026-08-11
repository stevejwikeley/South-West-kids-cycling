import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { findDuplicate } from "./dedup";
import type { ExtractedEvent } from "./extract-events";
import type { Database, EventRow, EventPendingRow } from "@/lib/supabase/types";

// Shared by both the manual "paste URL/text" admin flow and the nightly
// watched-source cron — one save path so dedup behaves identically either way.
export async function saveCandidates(
  supabase: SupabaseClient<Database>,
  candidates: ExtractedEvent[],
  rawSourceRef: string,
  sourceUrl?: string
): Promise<number> {
  const [{ data: liveEvents, error: liveError }, { data: pendingRows, error: pendingError }] = await Promise.all([
    supabase.from("events").select("*"),
    supabase.from("events_pending").select("*").eq("source_type", "smart_ingest"),
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
    const duplicate = findDuplicate(candidate, comparisonPool);
    // A match against another pending row just means "already queued, don't
    // insert again" — only a match against a *live* event should be recorded
    // as duplicate_of (merge target on approval).
    if (duplicate && !liveIds.has(duplicate.id)) continue;

    const { error } = await supabase.from("events_pending").insert({
      title: candidate.title,
      discipline: candidate.discipline,
      status: candidate.status ?? "confirmed",
      start_datetime: candidate.date ? `${candidate.date}T00:00:00.000Z` : null,
      venue_name: candidate.venue_name,
      address: candidate.address,
      postcode: candidate.postcode,
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
      source_type: "smart_ingest",
      source_detail: rawSourceRef,
      raw_source_ref: rawSourceRef,
      extraction_confidence: candidate.confidence,
      duplicate_of: duplicate?.id ?? null,
    });

    if (!error) saved++;
  }

  return saved;
}
