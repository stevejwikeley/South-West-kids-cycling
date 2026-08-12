"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { approveChange, approveIngested, rejectChange, type PendingActionResult } from "@/lib/actions/pending";
import PendingEditPanel from "./PendingEditPanel";
import type { EventPendingRow, EventRow } from "@/lib/supabase/types";

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

export default function PendingQueue({ pending, liveEvents, redirectTo }: { pending: EventPendingRow[]; liveEvents: EventRow[]; redirectTo: string }) {
  const router = useRouter();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);

  const liveById = new Map(liveEvents.map((e) => [e.id, e]));

  if (pending.length === 0) {
    return <p style={{ color: "#9A9992", fontSize: 13.5 }}>No pending changes — you&apos;re all caught up.</p>;
  }

  async function run(id: string, fn: () => Promise<PendingActionResult>) {
    setBusyIds((prev) => new Set(prev).add(id));
    setErrors((prev) => ({ ...prev, [id]: "" }));
    const result = await fn();
    setBusyIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    if (result?.error) {
      setErrors((prev) => ({ ...prev, [id]: result.error! }));
      return;
    }
    router.push(redirectTo);
    router.refresh();
  }

  const editingRow = editingId ? pending.find((p) => p.id === editingId) ?? null : null;

  return (
    <div style={{ borderTop: "2px solid #111111" }}>
      {pending.map((p) => {
        const isIngested = p.source_type === "smart_ingest" || p.source_type === "public_submission";
        const diff = (p.diff_against ?? {}) as Record<string, { from: unknown; to: unknown }>;
        const note = diff._note?.to as string | undefined;
        const diffFields = Object.entries(diff).filter(([key]) => key !== "_note");
        const isBusy = busyIds.has(p.id);
        const matchedLive = p.duplicate_of ? liveById.get(p.duplicate_of) ?? null : null;

        return (
          <div key={p.id} style={{ padding: "20px 6px", borderBottom: "1px solid #E4E2DD" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{p.title ?? "Untitled event"}</div>
                {isIngested && (
                  <div className="mono" style={{ fontSize: 10, color: "#9A9992", marginTop: 2 }}>
                    {p.source_type === "public_submission" ? "PUBLIC SUBMISSION" : "SMART INGEST"}
                    {p.extraction_confidence != null && ` · CONFIDENCE ${Math.round(p.extraction_confidence * 100)}%`}
                    {p.duplicate_of ? " · MATCHES AN EXISTING EVENT" : " · NEW EVENT"}
                    {p.raw_source_ref && ` · ${p.raw_source_ref}`}
                    {p.field_flags && Object.keys(p.field_flags).length > 0 && (
                      <span style={{ color: "#9A6B00" }}> · {Object.keys(p.field_flags).length} FIELD{Object.keys(p.field_flags).length === 1 ? "" : "S"} NEED VERIFICATION</span>
                    )}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => setEditingId(p.id)}
                  className="mono"
                  style={{ fontSize: 11.5, fontWeight: 700, color: "#111111", background: "none", border: "1px solid #111111", padding: "7px 14px", cursor: isBusy ? "default" : "pointer", opacity: isBusy ? 0.6 : 1 }}
                >
                  Edit
                </button>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() =>
                    run(p.id, () => (isIngested ? approveIngested(p.id) : approveChange(p.id)))
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
                    if (confirm("Reject this pending item?")) run(p.id, () => rejectChange(p.id));
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
                  {FIELD_ORDER.map((key) => {
                    const liveValue = matchedLive ? (matchedLive as unknown as Record<string, unknown>)[key] : undefined;
                    const differs = matchedLive && formatValue(liveValue) !== formatValue(p[key]);
                    const flagged = p.field_flags?.[key];
                    return (
                      <tr key={key}>
                        <td style={{ color: "#9A9992", padding: "3px 12px 3px 0", verticalAlign: "top", whiteSpace: "nowrap" }}>{key}</td>
                        <td style={{ color: "#111111", padding: "3px 0", verticalAlign: "top" }}>
                          {formatValue(p[key])}
                          {flagged && (
                            <span className="mono" style={{ color: "#9A6B00", marginLeft: 8, fontSize: 10.5 }} title={flagged}>
                              ⚠ needs verification
                            </span>
                          )}
                          {differs && (
                            <span className="mono" style={{ color: "#9A6B00", marginLeft: 8, fontSize: 10.5 }}>
                              (live: {formatValue(liveValue)})
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
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

      {editingRow && (
        <PendingEditPanel
          row={editingRow}
          liveEvent={editingRow.duplicate_of ? liveById.get(editingRow.duplicate_of) ?? null : null}
          onClose={() => setEditingId(null)}
          onSaved={() => {
            setEditingId(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
