"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deleteSeries } from "@/lib/actions/event-series";
import { generateOccurrenceDates } from "@/lib/recurrence";
import { fmtDay } from "@/lib/format";
import { eventDisc } from "@/lib/mock-data";
import type { EventSeriesRow } from "@/lib/supabase/types";
import type { DisciplineId } from "@/lib/types";

const WEEKDAY_LABELS: Record<number, string> = { 1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri", 6: "Sat", 7: "Sun" };

function weekdaySummary(weekdays: number[]): string {
  return [...weekdays].sort((a, b) => a - b).map((d) => WEEKDAY_LABELS[d]).join(", ");
}

// Rough count for display — ignores skip exceptions, since those live in a
// separate table this list doesn't fetch. "up to N" makes that explicit.
function occurrenceCount(series: EventSeriesRow): number {
  const result = generateOccurrenceDates({ startDate: series.start_date, untilDate: series.until_date, weekdays: series.weekdays });
  return result.ok ? result.dates.length : 0;
}

export default function SeriesList({ series, editBasePath }: { series: EventSeriesRow[]; editBasePath: string }) {
  const router = useRouter();
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});

  if (series.length === 0) {
    return <p style={{ color: "#6B6B66", fontSize: 13.5 }}>No recurring events yet.</p>;
  }

  async function handleDelete(id: string, title: string) {
    if (!confirm(`Delete the recurring series "${title}"? Occurrences you've individually edited will be kept as standalone events; the rest will be removed. This can't be undone.`)) return;
    setBusyIds((prev) => new Set(prev).add(id));
    setErrors((prev) => ({ ...prev, [id]: "" }));
    const result = await deleteSeries(id);
    if (result.error) {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setErrors((prev) => ({ ...prev, [id]: result.error! }));
      return;
    }
    router.refresh();
  }

  return (
    <div style={{ borderTop: "2px solid #111111" }}>
      {series.map((s) => {
        const d = eventDisc(s.discipline as DisciplineId);
        const start = fmtDay(s.start_date);
        const isBusy = busyIds.has(s.id);
        return (
          <div key={s.id} className="row-hover" style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 6px", borderBottom: "1px solid #E4E2DD", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontWeight: 700, fontSize: 14.5 }}>{s.title}</span>
                <span className="mono" style={{ fontSize: 12.5, color: "#6B6B66", flexShrink: 0 }}>Every {weekdaySummary(s.weekdays)}</span>
              </div>
              <div className="mono" style={{ fontSize: 10.5, color: "#6B6B66", marginTop: 4, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <span>{s.venue_name}</span>
                <span style={{ fontSize: 9.5, fontWeight: 700, padding: "3px 8px", background: `${d.color}18`, color: d.color, letterSpacing: "0.02em" }}>{d.label.toUpperCase()}</span>
                <span>· From {start.day}.{start.mon} until {fmtDay(s.until_date).day}.{fmtDay(s.until_date).mon} · up to {occurrenceCount(s)} sessions</span>
              </div>
              {errors[s.id] && <div style={{ fontSize: 12, color: "#A13A2A", marginTop: 4 }}>{errors[s.id]}</div>}
            </div>
            <Link href={`${editBasePath}/${s.id}/edit`} className="mono" style={{ fontSize: 11.5, fontWeight: 700, color: "#111111", border: "1px solid #111111", padding: "7px 14px" }}>
              Edit
            </Link>
            <button
              type="button"
              disabled={isBusy}
              onClick={() => handleDelete(s.id, s.title)}
              className="mono"
              style={{ fontSize: 11.5, color: "#A13A2A", background: "none", border: "1px solid #D8D6D0", padding: "7px 14px", cursor: isBusy ? "default" : "pointer", opacity: isBusy ? 0.6 : 1 }}
            >
              {isBusy ? "Deleting…" : "Delete"}
            </button>
          </div>
        );
      })}
    </div>
  );
}
