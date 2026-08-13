"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deleteEvent, verifyEventFields } from "@/lib/actions/events";
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
  const router = useRouter();
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showPast, setShowPast] = useState(false);

  if (events.length === 0) {
    return <p style={{ color: "#9A9992", fontSize: 13.5 }}>No events yet.</p>;
  }

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = events.filter((e) => e.start_datetime.slice(0, 10) >= today);
  const pastCount = events.length - upcoming.length;
  const visibleEvents = showPast ? events : upcoming;

  async function handleDelete(id: string, title: string) {
    if (!confirm(`Delete "${title}"? This can't be undone.`)) return;
    setBusyIds((prev) => new Set(prev).add(id));
    setErrors((prev) => ({ ...prev, [id]: "" }));
    const result = await deleteEvent(id);
    if (result.error) {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setErrors((prev) => ({ ...prev, [id]: result.error! }));
      return;
    }
    router.push(redirectTo);
    router.refresh();
  }

  async function handleVerify(id: string) {
    setBusyIds((prev) => new Set(prev).add(id));
    setErrors((prev) => ({ ...prev, [id]: "" }));
    const result = await verifyEventFields(id);
    setBusyIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    if (result.error) {
      setErrors((prev) => ({ ...prev, [id]: result.error! }));
      return;
    }
    router.refresh();
  }

  return (
    <div>
      {pastCount > 0 && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
          <button
            type="button"
            onClick={() => setShowPast((prev) => !prev)}
            className="mono"
            style={{ fontSize: 11.5, color: "#6B6B66", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
          >
            {showPast ? "Hide past events" : `Show past events (${pastCount})`}
          </button>
        </div>
      )}
      <div style={{ borderTop: "2px solid #111111" }}>
        {visibleEvents.length === 0 && (
          <p style={{ color: "#9A9992", fontSize: 13.5, padding: "16px 6px" }}>No upcoming events.</p>
        )}
        {visibleEvents.map((e) => {
          const d = eventDisc(e.discipline as DisciplineId);
          const f = fmtDay(e.start_datetime.slice(0, 10));
          const isBusy = busyIds.has(e.id);
          const flagEntries = e.field_flags ? Object.entries(e.field_flags) : [];
          return (
            <div key={e.id} className="row-hover" style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 6px", borderBottom: "1px solid #E4E2DD", flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 700, fontSize: 14.5 }}>{e.title}</span>
                  <span className="mono" style={{ fontSize: 12.5, color: "#6B6B66", flexShrink: 0 }}>{f.day}.{f.mon}</span>
                </div>
                <div className="mono" style={{ fontSize: 10.5, color: "#9A9992", marginTop: 4, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <span>{e.venue_name}</span>
                  <span style={{ fontSize: 9.5, fontWeight: 700, padding: "3px 8px", background: `${d.color}18`, color: d.color, letterSpacing: "0.02em" }}>{d.label.toUpperCase()}</span>
                  <span>· {e.status.toUpperCase()}{!e.approved ? " · UNAPPROVED" : ""}</span>
                  {flagEntries.length > 0 && (
                    <span style={{ color: "#9A6B00" }} title={flagEntries.map(([k, v]) => `${k}: ${v}`).join("\n")}>
                      · {flagEntries.length} NEEDS VERIFICATION ({flagEntries.map(([k]) => k).join(", ")})
                    </span>
                  )}
                </div>
                {errors[e.id] && <div style={{ fontSize: 12, color: "#A13A2A", marginTop: 4 }}>{errors[e.id]}</div>}
              </div>
              {flagEntries.length > 0 && (
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => handleVerify(e.id)}
                  className="mono"
                  style={{ fontSize: 11.5, fontWeight: 700, color: "#1F5D3A", background: "none", border: "1px solid #1F5D3A", padding: "7px 14px", cursor: isBusy ? "default" : "pointer", opacity: isBusy ? 0.6 : 1 }}
                >
                  {isBusy ? "…" : "Verify"}
                </button>
              )}
              <Link href={`${editBasePath}/${e.id}/edit`} className="mono" style={{ fontSize: 11.5, fontWeight: 700, color: "#111111", border: "1px solid #111111", padding: "7px 14px" }}>
                Edit
              </Link>
              <button
                type="button"
                disabled={isBusy}
                onClick={() => handleDelete(e.id, e.title)}
                className="mono"
                style={{ fontSize: 11.5, color: "#A13A2A", background: "none", border: "1px solid #D8D6D0", padding: "7px 14px", cursor: isBusy ? "default" : "pointer", opacity: isBusy ? 0.6 : 1 }}
              >
                {isBusy ? "Deleting…" : "Delete"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
