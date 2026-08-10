"use client";

import Link from "next/link";
import { deleteEvent } from "@/lib/actions/events";
import { fmtDay } from "@/lib/format";
import { eventDisc } from "@/lib/mock-data";
import type { EventRow } from "@/lib/supabase/types";
import type { DisciplineId } from "@/lib/types";

export default function EventList({
  events,
  editBasePath,
  redirectTo,
}: {
  events: EventRow[];
  editBasePath: string;
  redirectTo: string;
}) {
  if (events.length === 0) {
    return <p style={{ color: "#9A9992", fontSize: 13.5 }}>No events yet.</p>;
  }

  return (
    <div style={{ borderTop: "2px solid #111111" }}>
      {events.map((e) => {
        const d = eventDisc(e.discipline as DisciplineId);
        const f = fmtDay(e.start_datetime.slice(0, 10));
        return (
          <div key={e.id} className="row-hover" style={{ display: "flex", alignItems: "center", gap: 20, padding: "14px 6px", borderBottom: "1px solid #E4E2DD", flexWrap: "wrap" }}>
            <div className="mono" style={{ width: 80, flexShrink: 0, fontSize: 12.5, color: "#6B6B66" }}>{f.day}.{f.mon}</div>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: d.color, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontWeight: 700, fontSize: 14.5 }}>{e.title}</div>
              <div className="mono" style={{ fontSize: 10.5, color: "#9A9992", marginTop: 2 }}>{e.venue_name} · {e.status.toUpperCase()}{!e.approved ? " · UNAPPROVED" : ""}</div>
            </div>
            <Link href={`${editBasePath}/${e.id}/edit`} className="mono" style={{ fontSize: 11.5, fontWeight: 700, color: "#111111", border: "1px solid #111111", padding: "7px 14px" }}>
              Edit
            </Link>
            <button
              type="button"
              onClick={() => {
                if (confirm(`Delete "${e.title}"? This can't be undone.`)) {
                  deleteEvent(e.id, redirectTo);
                }
              }}
              className="mono"
              style={{ fontSize: 11.5, color: "#A13A2A", background: "none", border: "1px solid #D8D6D0", padding: "7px 14px", cursor: "pointer" }}
            >
              Delete
            </button>
          </div>
        );
      })}
    </div>
  );
}
