import SeriesForm from "@/components/events/SeriesForm";
import { getEventRowById } from "@/lib/data";
import { eventRowToSeriesPrefill } from "@/lib/actions/parse-series-form";

export default async function NewOrganiserSeriesPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  const fromEvent = from ? await getEventRowById(from) : null;

  return (
    <header style={{ maxWidth: 1100, margin: "0 auto", padding: "56px 24px 120px" }}>
      <div className="mono" style={{ fontSize: 11.5, letterSpacing: "0.12em", color: "#E0102A", marginBottom: 16, fontWeight: 700 }}>ORGANISER</div>
      <h1 className="disp" style={{ fontSize: "clamp(28px, 4.5vw, 40px)", lineHeight: 1.05, margin: 0, marginBottom: 28, letterSpacing: "-0.01em" }}>
        Add a recurring event.
      </h1>
      <SeriesForm
        redirectTo="/organiser"
        prefill={fromEvent ? eventRowToSeriesPrefill(fromEvent) : undefined}
        fromEventId={fromEvent?.id}
      />
    </header>
  );
}
