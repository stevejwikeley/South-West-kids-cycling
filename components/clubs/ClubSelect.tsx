"use client";

import { useState } from "react";
import ClubQuickAdd from "./ClubQuickAdd";
import type { Club } from "@/lib/types";

const label: React.CSSProperties = { fontSize: 10.5, color: "#6B6B66", display: "block", marginBottom: 6, letterSpacing: "0.03em" };
const input: React.CSSProperties = { width: "100%", background: "#FFFFFF", border: "1px solid #D8D6D0", color: "#111111", padding: "9px 11px", fontSize: 13.5 };
const field: React.CSSProperties = { marginBottom: 18 };

const NEW_CLUB_VALUE = "__new__";

// The "CLUB" field used by EventForm, SeriesForm and PendingEditPanel — a
// self-contained drop-in that also owns the "+ Add new club…" quick-add
// flow, so a club created mid-way through editing an event is immediately
// selected without leaving the page. `name="club_id"` is present on the
// <select> so EventForm/SeriesForm's native form submission picks it up
// directly; PendingEditPanel ignores the name and reads `value`/`onChange`
// instead, since it builds its own FormData by hand.
export default function ClubSelect({ clubs, value, onChange }: { clubs: Club[]; value: string; onChange: (clubId: string) => void }) {
  const [extraClubs, setExtraClubs] = useState<Club[]>([]);
  const [adding, setAdding] = useState(false);

  const allClubs = [...clubs, ...extraClubs.filter((c) => !clubs.some((existing) => existing.id === c.id))];

  if (adding) {
    return (
      <div style={field}>
        <label className="mono" style={label}>NEW CLUB</label>
        <ClubQuickAdd
          onCreated={(club) => {
            setExtraClubs((prev) => [...prev, club]);
            onChange(club.id);
            setAdding(false);
          }}
          onCancel={() => setAdding(false)}
        />
      </div>
    );
  }

  return (
    <div style={field}>
      <label className="mono" style={label}>CLUB (OPTIONAL)</label>
      <select
        style={input}
        name="club_id"
        value={value}
        onChange={(e) => {
          if (e.target.value === NEW_CLUB_VALUE) {
            setAdding(true);
            return;
          }
          onChange(e.target.value);
        }}
      >
        <option value="">None</option>
        {allClubs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        <option value={NEW_CLUB_VALUE}>+ Add new club…</option>
      </select>
    </div>
  );
}
