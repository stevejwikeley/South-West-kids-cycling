import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { geocodeLocation } from "@/lib/geocode";
import { ADMIN_DIFF_KEYS } from "@/lib/pending-diff-keys";
import { canAutoPublish, missingForPublish } from "./publish-ready";
import type { Database, EventPendingRow, PublishedViaType } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

// Turns one smart_ingest / public_submission pending row into live data —
// merging it into the matched live event (when the dedup check found one)
// or inserting a brand-new event — then removes it from the queue. Used by
// the admin "Approve" button (via "reviewed") and by saveCandidates when a
// candidate is complete enough to skip review (via "auto").
export async function publishPendingRow(
  supabase: Client,
  row: EventPendingRow,
  via: PublishedViaType,
  userId: string | null
): Promise<{ error?: string }> {
  const values: Record<string, unknown> = {};
  ADMIN_DIFF_KEYS.forEach((key) => {
    const v = (row as unknown as Record<string, unknown>)[key];
    // Skip null/undefined so DB defaults apply on insert, and so a field the
    // extraction wasn't confident about doesn't clobber good live data on
    // merge — same "don't overwrite with uncertainty" spirit as spec 4.2.
    if (v !== undefined && v !== null) values[key] = v;
  });
  // field_flags carries forward regardless — it's admin-only metadata (spec
  // 4.2: "needs verification" markers), not a public-facing field, so it's
  // not part of ADMIN_DIFF_KEYS but still belongs on the live row.
  if (row.field_flags) values.field_flags = row.field_flags;

  // Re-derived here rather than trusted from the pending row: events_pending
  // accepts unauthenticated inserts (public submissions), so lat/lng always
  // comes from our own lookup against the postcode that just passed the
  // ADMIN_DIFF_KEYS sandbox above, never from arbitrary pending-row data.
  if (values.postcode) {
    const coords = await geocodeLocation({ postcode: values.postcode as string });
    if (coords) {
      values.lat = coords.lat;
      values.lng = coords.lng;
    }
  }

  if (row.duplicate_of) {
    const { error } = await supabase
      .from("events")
      .update({ ...values, updated_by: userId })
      .eq("id", row.duplicate_of);
    if (error) return { error: error.message };
  } else {
    const missing = missingForPublish(row as unknown as Record<string, unknown>);
    if (missing.includes("club")) {
      // Plain sentence instead of the raw training_requires_club
      // constraint-violation message.
      return { error: "Attach the club that runs this training session before approving it." };
    }
    if (missing.length > 0) {
      return { error: `Can't approve as a new event — missing: ${missing.join(", ")}. Reject and add it manually via the event form instead.` };
    }

    const { error } = await supabase.from("events").insert({
      ...values,
      approved: true,
      source_type: row.source_type,
      published_via: via,
      created_by: userId,
      updated_by: userId,
    } as Database["public"]["Tables"]["events"]["Insert"]);
    if (error) return { error: error.message };
  }

  if (row.watched_source_id) await recordPublishOutcome(supabase, row.watched_source_id, row.was_edited);

  await supabase.from("events_pending").delete().eq("id", row.id);
  return {};
}

// Publishes every queued smart_ingest row that's complete enough to skip
// review — clears out what was queued before auto-publish existed, and
// anything an admin has since completed by editing. Public submissions and
// suggest-a-change rows are never swept: anyone on the internet can create
// those, so they always wait for a human.
export async function autoPublishQueue(supabase: Client): Promise<{ published: number; errors: string[] }> {
  const { data, error } = await supabase.from("events_pending").select("*").eq("source_type", "smart_ingest");
  if (error) return { published: 0, errors: [error.message] };

  let published = 0;
  const errors: string[] = [];
  for (const row of (data as EventPendingRow[]) ?? []) {
    if (!canAutoPublish(row as unknown as Record<string, unknown>)) continue;
    const result = await publishPendingRow(supabase, row, "auto", null);
    if (result.error) errors.push(`${row.title}: ${result.error}`);
    else published++;
  }
  return { published, errors };
}

// Spec 4.3: "self-tuning trust" — correction_rate is the rolling ratio of
// admin edits to total publishes for a watched source, recomputed from
// cumulative counters each time one of its candidates is published. Only
// candidates actually traced to a watched_source count; manual/ad-hoc
// ingestion (paste URL, upload) has no source to tune.
async function recordPublishOutcome(supabase: Client, watchedSourceId: string, wasEdited: boolean): Promise<void> {
  const { data } = await supabase
    .from("watched_sources")
    .select("published_count, corrected_count")
    .eq("id", watchedSourceId)
    .single();
  if (!data) return;

  const published_count = data.published_count + 1;
  const corrected_count = data.corrected_count + (wasEdited ? 1 : 0);
  const correction_rate = corrected_count / published_count;

  await supabase
    .from("watched_sources")
    .update({ published_count, corrected_count, correction_rate })
    .eq("id", watchedSourceId);
}
