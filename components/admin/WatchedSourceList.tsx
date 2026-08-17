"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { checkWatchedSourceNow, deleteWatchedSource } from "@/lib/actions/sources";
import type { WatchedSourceRow } from "@/lib/supabase/types";

function formatChecked(iso: string | null): string {
  if (!iso) return "Never";
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function StatusBadge({ source }: { source: WatchedSourceRow }) {
  if (!source.last_status) {
    return (
      <span className="mono" style={{ fontSize: 10, fontWeight: 700, color: "#6B6B66", border: "1px solid #D8D6D0", padding: "3px 8px" }}>
        NOT CHECKED YET
      </span>
    );
  }
  if (source.last_status === "error") {
    return (
      <span className="mono" style={{ fontSize: 10, fontWeight: 700, color: "#A13A2A", background: "#F7EAE7", padding: "3px 8px" }}>
        BLOCKED / FAILING
      </span>
    );
  }
  return (
    <span className="mono" style={{ fontSize: 10, fontWeight: 700, color: "#1F5D3A", background: "#EAF3EC", padding: "3px 8px" }}>
      OK
    </span>
  );
}

export default function WatchedSourceList({ sources, currentUserId, isSuperAdmin }: { sources: WatchedSourceRow[]; currentUserId: string; isSuperAdmin: boolean }) {
  const router = useRouter();
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});

  if (sources.length === 0) {
    return <p style={{ color: "#6B6B66", fontSize: 13.5 }}>No watched sources yet — add one to start nightly scanning.</p>;
  }

  function setBusy(id: string, busy: boolean) {
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function handleCheck(id: string) {
    setBusy(id, true);
    setErrors((prev) => ({ ...prev, [id]: "" }));
    setNotes((prev) => ({ ...prev, [id]: "" }));
    const result = await checkWatchedSourceNow(id);
    setBusy(id, false);
    if (result.error) setErrors((prev) => ({ ...prev, [id]: result.error! }));
    else if (result.detail) setNotes((prev) => ({ ...prev, [id]: result.detail! }));
    router.refresh();
  }

  async function handleDelete(id: string, label: string) {
    if (!confirm(`Stop watching "${label}"?`)) return;
    setBusy(id, true);
    setErrors((prev) => ({ ...prev, [id]: "" }));
    const result = await deleteWatchedSource(id);
    setBusy(id, false);
    if (result?.error) {
      setErrors((prev) => ({ ...prev, [id]: result.error! }));
      return;
    }
    router.refresh();
  }

  return (
    <div style={{ borderTop: "2px solid #111111" }}>
      {sources.map((s) => {
        const isBusy = busyIds.has(s.id);
        const canDelete = isSuperAdmin || s.created_by === currentUserId;
        return (
          <div key={s.id} style={{ padding: "16px 6px", borderBottom: "1px solid #E4E2DD" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 700, fontSize: 14.5 }}>{s.label}</span>
                  <StatusBadge source={s} />
                </div>
                <a href={s.url} target="_blank" rel="noreferrer" className="mono" style={{ fontSize: 11.5, color: "#4A4A46", wordBreak: "break-all" }}>
                  {s.url}
                </a>
                <div className="mono" style={{ fontSize: 10, color: "#6B6B66", marginTop: 4 }}>
                  {s.check_frequency.toUpperCase()} · LAST CHECKED {formatChecked(s.last_checked_at).toUpperCase()}
                  {s.last_status === "ok" && s.last_result_count != null && ` · ${s.last_result_count} FOUND LAST RUN`}
                  {" · "}
                  {s.published_count > 0
                    ? `${Math.round(s.correction_rate * 100)}% CORRECTION RATE (${s.published_count} PUBLISHED)`
                    : "NO PUBLISH HISTORY YET"}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => handleCheck(s.id)}
                  className="mono"
                  style={{ fontSize: 11.5, fontWeight: 700, color: "#111111", background: "none", border: "1px solid #111111", padding: "7px 14px", cursor: isBusy ? "default" : "pointer", opacity: isBusy ? 0.6 : 1 }}
                >
                  {isBusy ? "Checking…" : "Check now"}
                </button>
                {canDelete ? (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => handleDelete(s.id, s.label)}
                    className="mono"
                    style={{ fontSize: 11.5, fontWeight: 700, color: "#A13A2A", background: "none", border: "1px solid #D8D6D0", padding: "7px 14px", cursor: isBusy ? "default" : "pointer", opacity: isBusy ? 0.6 : 1 }}
                  >
                    {isBusy ? "Working…" : "Remove"}
                  </button>
                ) : (
                  <span className="mono" style={{ fontSize: 10.5, color: "#6B6B66", padding: "7px 0" }}>
                    {s.created_by ? "Added by another admin" : "Added before ownership tracking"}
                  </span>
                )}
              </div>
            </div>
            {s.last_status === "error" && s.last_error && !notes[s.id] && !errors[s.id] && (
              <p style={{ fontSize: 12.5, color: "#A13A2A", marginTop: 8 }}>{s.last_error}</p>
            )}
            {notes[s.id] && <p style={{ fontSize: 12.5, color: "#4A4A46", marginTop: 8 }}>{notes[s.id]}</p>}
            {errors[s.id] && <p style={{ fontSize: 12.5, color: "#A13A2A", marginTop: 8 }}>{errors[s.id]}</p>}
          </div>
        );
      })}
    </div>
  );
}
