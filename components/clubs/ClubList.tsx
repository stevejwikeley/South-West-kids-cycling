"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deleteClub } from "@/lib/actions/clubs";
import { clubDisc } from "@/lib/mock-data";
import type { Club } from "@/lib/types";

export default function ClubList({ clubs, editBasePath }: { clubs: Club[]; editBasePath: string }) {
  const router = useRouter();
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});

  if (clubs.length === 0) {
    return <p style={{ color: "#6B6B66", fontSize: 13.5 }}>No clubs yet.</p>;
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}"? Any events linked to it will keep their other details but lose the club link. This can't be undone.`)) return;
    setBusyIds((prev) => new Set(prev).add(id));
    setErrors((prev) => ({ ...prev, [id]: "" }));
    const result = await deleteClub(id);
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
      {clubs.map((c) => {
        const isBusy = busyIds.has(c.id);
        return (
          <div key={c.id} className="row-hover" style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 6px", borderBottom: "1px solid #E4E2DD", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontWeight: 700, fontSize: 14.5 }}>{c.name}</div>
              <div className="mono" style={{ fontSize: 10.5, color: "#6B6B66", marginTop: 4, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <span>{c.location}</span>
                {c.disciplines.map((did) => {
                  const d = clubDisc(did);
                  return <span key={did} style={{ fontSize: 9.5, fontWeight: 700, padding: "3px 8px", background: `${d.color}18`, color: d.color, letterSpacing: "0.02em" }}>{d.label.toUpperCase()}</span>;
                })}
                {c.kidsOnly && <span>· YOUTH ONLY</span>}
              </div>
              {errors[c.id] && <div style={{ fontSize: 12, color: "#A13A2A", marginTop: 4 }}>{errors[c.id]}</div>}
            </div>
            <Link href={`${editBasePath}/${c.id}/edit`} className="mono" style={{ fontSize: 11.5, fontWeight: 700, color: "#111111", border: "1px solid #111111", padding: "7px 14px" }}>
              Edit
            </Link>
            <button
              type="button"
              disabled={isBusy}
              onClick={() => handleDelete(c.id, c.name)}
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
