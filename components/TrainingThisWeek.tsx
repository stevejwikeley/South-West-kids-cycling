import Link from "next/link";
import { sessionsInNextDays, groupByClub, distinctDates, type TrainingSession } from "@/lib/training";
import { fmtDay } from "@/lib/format";
import type { Club } from "@/lib/types";

// Renders nothing when the coming week is empty. A strip saying "no training
// this week" would be a worse answer than no strip at all — it draws the eye
// to an absence rather than letting the calendar get on with its job.
export default function TrainingThisWeek({
  sessions,
  clubs,
}: {
  sessions: TrainingSession[];
  clubs: Club[];
}) {
  const today = new Date().toISOString().slice(0, 10);
  const thisWeek = sessionsInNextDays(sessions, today, 7);
  if (thisWeek.length === 0) return null;

  const clubName = new Map(clubs.map((c) => [c.id, c.name]));
  const byClub = [...groupByClub(thisWeek).entries()];

  return (
    <div
      data-testid="training-this-week"
      style={{ border: "1px solid #E4E2DD", background: "#FFFFFF", padding: "14px 16px", marginTop: 26, maxWidth: 560 }}
    >
      <div style={{ fontSize: 16, fontWeight: 700, color: "#111111", lineHeight: 1.3, marginBottom: 8 }}>
        Looking for a club for your child to join?
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <span className="mono" style={{ fontSize: 10.5, letterSpacing: "0.08em", color: "#1F5D3A", fontWeight: 700 }}>
          CLUB TRAINING THIS WEEK
        </span>
        <Link href="/clubs" style={{ fontSize: 11.5, fontWeight: 700, color: "#111111", borderBottom: "1px solid #111111", paddingBottom: 1 }}>
          All club training
        </Link>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 11 }}>
        {byClub.map(([clubId, list]) => (
          <div key={clubId} style={{ fontSize: 12.5, color: "#4A4A46", lineHeight: 1.5 }}>
            <Link href={`/clubs#club-${clubId}`} style={{ fontWeight: 700, color: "#111111" }}>
              {clubName.get(clubId) ?? "Club"}
            </Link>
            {" — "}
            {distinctDates(list).map((date) => `${fmtDay(date).day} ${fmtDay(date).mon}`).join(", ")}
          </div>
        ))}
      </div>
    </div>
  );
}
