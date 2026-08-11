"use client";

import { useState } from "react";
import { deleteWatchedSource } from "@/lib/actions/sources";
import type { WatchedSourceRow } from "@/lib/supabase/types";

function formatChecked(iso: string | null): string {
  if (!iso) return "Never";
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function WatchedSourceList({ sources, redirectTo }: { sources: WatchedSourceRow[]; redirectTo: string }) {
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});

  if (sources.length === 0) {
    return <p style={{ color: "#9A9992", fontSize: 13.5 }}>No watched sources yet — add one to start nightly scanning.</p>;
  }

  async function handleDelete(id: string, label: string) {
    if (!confirm(`Stop watching "${label}"?`)) return;
    setBusyIds((prev) => new Set(prev).add(id));
    setErrors((prev) => ({ ...prev, [id]: "" }));
    const result = await deleteWatchedSource(id, redirectTo);
    setBusyIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    if (result?.error) setErrors((prev) => ({ ...prev, [id]: result.error! }));
  }

  return (
    <div style={{ borderTop: "2px solid #111111" }}>
      {sources.map((s) => {
        const isBusy = busyIds.has(s.id);
        return (
          <div key={s.id} style={{ padding: "16px 6px", borderBottom: "1px solid #E4E2DD" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14.5 }}>{s.label}</div>
                <a href={s.url} target="_blank" rel="noreferrer" className="mono" style={{ fontSize: 11.5, color: "#4A4A46", wordBreak: "break-all" }}>
                  {s.url}
                </a>
                <div className="mono" style={{ fontSize: 10, color: "#9A9992", marginTop: 4 }}>
                  {s.check_frequency.toUpperCase()} · LAST CHECKED {formatChecked(s.last_checked_at).toUpperCase()}
                  {s.last_result_count != null && ` · ${s.last_result_count} FOUND LAST RUN`}
                </div>
              </div>
              <button
                type="button"
                disabled={isBusy}
                onClick={() => handleDelete(s.id, s.label)}
                className="mono"
                style={{ fontSize: 11.5, fontWeight: 700, color: "#A13A2A", background: "none", border: "1px solid #D8D6D0", padding: "7px 14px", cursor: isBusy ? "default" : "pointer", opacity: isBusy ? 0.6 : 1 }}
              >
                {isBusy ? "Working…" : "Remove"}
              </button>
            </div>
            {errors[s.id] && <p style={{ fontSize: 12.5, color: "#A13A2A", marginTop: 8 }}>{errors[s.id]}</p>}
          </div>
        );
      })}
    </div>
  );
}
