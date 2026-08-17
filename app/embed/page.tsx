import { getEvents } from "@/lib/data";
import { eventDisc, ageLabel } from "@/lib/mock-data";
import { fmtDay } from "@/lib/format";
import type { DisciplineId, Region } from "@/lib/types";

export const revalidate = 60;

// Deliberately outside the root layout's nav/footer/feedback bubble — see
// the pathname checks in TopNav/Footer/FeedbackPopup — since this route is
// meant to be dropped into a club's own website via <iframe>, not browsed
// directly. Query params let a club scope it to what's relevant to them:
// ?region=devon|cornwall|somerset, ?discipline=cx,xc,..., ?limit=10 (default 15).
export default async function EmbedPage({
  searchParams,
}: {
  searchParams: Promise<{ region?: string; discipline?: string; limit?: string }>;
}) {
  const { region, discipline, limit } = await searchParams;
  const events = await getEvents();

  const disciplineFilter = discipline ? new Set(discipline.split(",") as DisciplineId[]) : null;
  const regionFilter = region as Region | undefined;
  const max = Math.max(1, Math.min(50, Number(limit) || 15));

  const filtered = events
    .filter((e) => !regionFilter || e.region === regionFilter || e.region === "both")
    .filter((e) => !disciplineFilter || disciplineFilter.has(e.discipline))
    .slice(0, max);

  return (
    <div style={{ fontFamily: "var(--font-inter), sans-serif", padding: "16px 4px", maxWidth: 640 }}>
      {filtered.length === 0 && (
        <p style={{ color: "#6B6B66", fontSize: 13.5 }}>No upcoming events match right now — check back soon.</p>
      )}
      <div style={{ borderTop: "2px solid #111111" }}>
        {filtered.map((e) => {
          const d = eventDisc(e.discipline);
          const f = fmtDay(e.date);
          const actionUrl = e.bookingStatus === "open" ? e.booking ?? e.organiserUrl : e.organiserUrl;
          const actionLabel = e.bookingStatus === "open" ? "Book" : "Organisers website";
          return (
            <div key={e.id} style={{ padding: "12px 4px", borderBottom: "1px solid #E4E2DD" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontWeight: 700, fontSize: 14 }}>{e.title}</span>
                <span className="mono" style={{ fontSize: 11, color: "#6B6B66" }}>{f.day}.{f.mon}</span>
              </div>
              <div className="mono" style={{ fontSize: 10, color: "#6B6B66", marginTop: 3, display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                <span>{e.venue}</span>
                <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 7px", background: `${d.color}18`, color: d.color, letterSpacing: "0.02em" }}>{d.label.toUpperCase()}</span>
                <span>· {e.ages.map(ageLabel).join(", ")}</span>
              </div>
              <a href={actionUrl} target="_blank" rel="noreferrer" style={{ fontSize: 11.5, fontWeight: 700, color: "#111111", textDecoration: "underline", marginTop: 6, display: "inline-block" }}>
                {actionLabel} &rarr;
              </a>
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 16, padding: "12px 4px 0", borderTop: "1px solid #E4E2DD" }}>
        <a
          href="https://www.southwestkidscycling.uk/subscribe?utm_source=embed"
          target="_blank"
          rel="noreferrer"
          className="mono"
          style={{ fontSize: 10.5, color: "#6B6B66" }}
        >
          Full calendar &amp; subscribe: southwestkidscycling.uk &rarr;
        </a>
      </div>
    </div>
  );
}
