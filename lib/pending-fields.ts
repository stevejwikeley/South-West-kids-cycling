import type { EventPendingRow, EventRow } from "@/lib/supabase/types";

type Diff = Record<string, { from: unknown; to: unknown }>;

// A change_request row only stores fields that differ from the live event
// (in diff_against); a smart_ingest or public_submission row stores every
// field directly. Either way, this resolves "what is this pending row
// actually proposing for `key`" to one shape.
//
// Lives here rather than inside PendingEditPanel because the convert-to-
// recurring path needs the same resolution server-side, to prefill the
// series form from a pending row (see pendingRowToSeriesPrefill).
export function resolvePendingField(
  row: EventPendingRow,
  liveEvent: EventRow | null,
  key: string
): unknown {
  if (row.source_type === "change_request") {
    const diff = (row.diff_against as Diff | null) ?? {};
    if (key in diff) return diff[key].to;
    return liveEvent ? (liveEvent as unknown as Record<string, unknown>)[key] : null;
  }
  return (row as unknown as Record<string, unknown>)[key] ?? null;
}
