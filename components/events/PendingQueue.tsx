"use client";

import { useState } from "react";
import { approveChange, approveIngested, rejectChange, type PendingActionResult } from "@/lib/actions/pending";
import type { EventPendingRow } from "@/lib/supabase/types";

function formatValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (Array.isArray(v)) return v.length ? v.join(", ") : "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v);
}

const FIELD_ORDER: (keyof EventPendingRow)[] = [
  "discipline",
  "status",
  "start_datetime",
  "venue_name",
  "address",
  "region",
  "age_categories",
  "kids_only",
  "booking_status",
  "booking_link",
  "organiser_url",
];

export default function PendingQueue({ pending, redirectTo }: { pending: EventPendingRow[]; redirectTo: string }) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  if (pending.length === 0) {
    return <p style={{ color: "#9A9992", fontSize: 13.5 }}>No pending changes — you&apos;re all caught up.</p>;
  }

  async function run(id: string, fn: () => Promise<PendingActionResult>) {
    setPendingIds((prev) => new Set(prev).add(id));
    setErrors((prev) => ({ ...prev, [id]: "" }));
    const result = await fn();
    setPendingIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    if (result?.error) {
      setErrors((prev) => ({ ...prev, [id]: result.error! }));
    }
  }

  return (
    <div style={{ borderTop: "2px solid #111111" }}>
      {pending.map((p) => {
        const isIngested = p.source_type === "smart_ingest";
        const diff = (p.diff_against ?? {}) as Record<string, { from: unknown; to: unknown }>;
        const note = diff._note?.to as string | undefined;
        const diffFields = Object.entries(diff).filter(([key]) => key !== "_note");
        const isBusy = pendingIds.has(p.id);

        return (
          <div key={p.id} style={{ padding: "20px 6px", borderBottom: "1px solid #E4E2DD" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{p.title ?? "Untitled event"}</div>
                {isIngested && (
                  <div className="mono" style={{ fontSize: 10, color: "#9A9992", marginTop: 2 }}>
                    SMART INGEST
                    {p.extraction_confidence != null && ` · CONFIDENCE ${Math.round(p.extraction_confidence * 100)}%`}
                    {p.duplicate_of ? " · MATCHES AN EXISTING EVENT" : " · NEW EVENT"}
                    {p.raw_source_ref && ` · ${p.raw_source_ref}`}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() =>
                    run(p.id, () => (isIngested ? approveIngested(p.id, redirectTo) : approveChange(p.id, redirectTo)))
                  }
                  className="mono"
                  style={{ fontSize: 11.5, fontWeight: 700, color: "#1F5D3A", background: "#EAF3EC", border: "1px solid #1F5D3A", padding: "7px 14px", cursor: isBusy ? "default" : "pointer", opacity: isBusy ? 0.6 : 1 }}
                >
                  {isBusy ? "Working…" : "Approve"}
                </button>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => {
                    if (confirm("Reject this pending item?")) run(p.id, () => rejectChange(p.id, redirectTo));
                  }}
                  className="mono"
                  style={{ fontSize: 11.5, fontWeight: 700, color: "#A13A2A", background: "none", border: "1px solid #D8D6D0", padding: "7px 14px", cursor: isBusy ? "default" : "pointer", opacity: isBusy ? 0.6 : 1 }}
                >
                  Reject
                </button>
              </div>
            </div>

            {isIngested ? (
              <table className="mono" style={{ fontSize: 12, width: "100%", borderCollapse: "collapse" }}>
                <tbody>
                  {FIELD_ORDER.map((key) => (
                    <tr key={key}>
                      <td style={{ color: "#9A9992", padding: "3px 12px 3px 0", verticalAlign: "top", whiteSpace: "nowrap" }}>{key}</td>
                      <td style={{ color: "#111111", padding: "3px 0", verticalAlign: "top" }}>{formatValue(p[key])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              diffFields.length > 0 && (
                <table className="mono" style={{ fontSize: 12, width: "100%", borderCollapse: "collapse" }}>
                  <tbody>
                    {diffFields.map(([key, change]) => (
                      <tr key={key}>
                        <td style={{ color: "#9A9992", padding: "3px 12px 3px 0", verticalAlign: "top", whiteSpace: "nowrap" }}>{key}</td>
                        <td style={{ color: "#A13A2A", padding: "3px 12px 3px 0", verticalAlign: "top" }}>{formatValue(change.from)}</td>
                        <td style={{ color: "#6B6B66", padding: "3px 6px 3px 0" }}>→</td>
                        <td style={{ color: "#1F5D3A", padding: "3px 0", verticalAlign: "top", fontWeight: 700 }}>{formatValue(change.to)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            )}

            {note && (
              <p style={{ fontSize: 12.5, color: "#4A4A46", marginTop: 10, fontStyle: "italic" }}>&ldquo;{note}&rdquo;</p>
            )}

            {errors[p.id] && (
              <p style={{ fontSize: 12.5, color: "#A13A2A", marginTop: 10 }}>{errors[p.id]}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
