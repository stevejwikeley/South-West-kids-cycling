import SeriesForm from "@/components/events/SeriesForm";
import { getClubs, getEventRowById, getPendingRowById } from "@/lib/data";
import { eventRowToSeriesPrefill, pendingRowToSeriesPrefill } from "@/lib/actions/parse-series-form";

export default async function NewAdminSeriesPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; fromPending?: string }>;
}) {
  const { from, fromPending } = await searchParams;
  const [fromEvent, pendingRow, clubs] = await Promise.all([
    from ? getEventRowById(from) : Promise.resolve(null),
    fromPending ? getPendingRowById(fromPending) : Promise.resolve(null),
    getClubs(),
  ]);

  // A pending row can point at a live event it was matched to (a change
  // request, or a smart-ingest duplicate) — that event supplies the fields
  // the pending row doesn't carry, and is what the new series replaces.
  const matchedLive = pendingRow?.duplicate_of ? await getEventRowById(pendingRow.duplicate_of) : null;

  const prefill = pendingRow
    ? pendingRowToSeriesPrefill(pendingRow, matchedLive)
    : fromEvent
      ? eventRowToSeriesPrefill(fromEvent)
      : undefined;

  return (
    <header style={{ maxWidth: 1100, margin: "0 auto", padding: "56px 24px 120px" }}>
      <div className="mono" style={{ fontSize: 11.5, letterSpacing: "0.12em", color: "#E0102A", marginBottom: 16, fontWeight: 700 }}>ADMIN</div>
      <h1 className="disp" style={{ fontSize: "clamp(28px, 4.5vw, 40px)", lineHeight: 1.05, margin: 0, marginBottom: 28, letterSpacing: "-0.01em" }}>
        Add a recurring event.
      </h1>
      <SeriesForm
        redirectTo={pendingRow ? "/admin/pending" : "/admin"}
        prefill={prefill}
        fromEventId={pendingRow ? undefined : fromEvent?.id}
        fromPendingId={pendingRow?.id}
        pendingReplacesEventTitle={matchedLive?.title ?? null}
        clubs={clubs}
      />
    </header>
  );
}
