"use client";

import { weekdayPattern, nextSessions, type TrainingSession } from "@/lib/training";
import { fmtDay } from "@/lib/format";
import { trackEvent } from "@/lib/analytics";
import type { Club } from "@/lib/types";

const GREEN = "#1F5D3A";

function dateLabel(date: string) {
  const f = fmtDay(date);
  return `${f.dow} ${f.day} ${f.mon}`;
}

export default function ClubTrainingBand({ club, sessions }: { club: Club; sessions: TrainingSession[] }) {
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = nextSessions(sessions, today, 3);

  if (upcoming.length === 0) {
    return (
      <div style={{ fontSize: 12, color: "#6B6B66", marginTop: 9 }}>
        No training sessions listed —{" "}
        <a href="/submit-event" style={{ color: "#6B6B66", textDecoration: "underline", textUnderlineOffset: 2 }}>
          tell us about theirs
        </a>
      </div>
    );
  }

  const pattern = weekdayPattern(upcoming);
  const [next, ...rest] = upcoming;
  const feedUrl = `/calendar.ics?club=${club.id}&kind=training`;

  return (
    <div
      data-testid="club-training"
      style={{ background: "#EAF3EC", borderLeft: `3px solid ${GREEN}`, padding: "8px 10px", marginTop: 9, fontSize: 12.5, color: GREEN, lineHeight: 1.55 }}
    >
      <span style={{ fontWeight: 700 }}>{pattern ? `Trains ${pattern}` : "Training sessions"}</span>
      {next.venue ? ` · ${next.venue}` : ""}
      {club.trainingNote && <div style={{ marginTop: 4 }}>{club.trainingNote}</div>}
      <div style={{ marginTop: 4 }}>
        Next: <strong>{dateLabel(next.date)}</strong>
        {rest.length > 0 && ` · then ${rest.map((s) => `${fmtDay(s.date).day} ${fmtDay(s.date).mon}`).join(", ")}`}
      </div>
      <a
        href={feedUrl}
        onClick={() => trackEvent("club_training_subscribe", { club_id: club.id, club_name: club.name })}
        style={{ display: "inline-block", marginTop: 6, fontSize: 11.5, fontWeight: 700, color: GREEN, borderBottom: `1px solid ${GREEN}`, paddingBottom: 1 }}
      >
        Add this club&apos;s training to my calendar
      </a>
    </div>
  );
}
