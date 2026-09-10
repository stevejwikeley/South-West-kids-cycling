import SeriesForm from "@/components/events/SeriesForm";
import { getClubs, getEventRowById } from "@/lib/data";
import { eventRowToSeriesPrefill } from "@/lib/actions/parse-series-form";

export default async function NewAdminSeriesPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  const [fromEvent, clubs] = await Promise.all([from ? getEventRowById(from) : Promise.resolve(null), getClubs()]);

  return (
    <header style={{ maxWidth: 1100, margin: "0 auto", padding: "56px 24px 120px" }}>
      <div className="mono" style={{ fontSize: 11.5, letterSpacing: "0.12em", color: "#E0102A", marginBottom: 16, fontWeight: 700 }}>ADMIN</div>
      <h1 className="disp" style={{ fontSize: "clamp(28px, 4.5vw, 40px)", lineHeight: 1.05, margin: 0, marginBottom: 28, letterSpacing: "-0.01em" }}>
        Add a recurring event.
      </h1>
      <SeriesForm
        redirectTo="/admin"
        prefill={fromEvent ? eventRowToSeriesPrefill(fromEvent) : undefined}
        fromEventId={fromEvent?.id}
        clubs={clubs}
      />
    </header>
  );
}
