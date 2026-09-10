"use client";

import { useState } from "react";
import { createClub } from "@/lib/actions/clubs";
import ClubFields from "./ClubFields";
import { clubToValues, clubValuesToFormData, type ClubFieldValues } from "./club-form-values";
import type { Club } from "@/lib/types";

// Rendered inline in place of the CLUB <select> when "+ Add new club…" is
// chosen (EventForm, SeriesForm, PendingEditPanel). Unlike ClubForm, this
// calls createClub() directly rather than going through useActionState —
// it needs the created row back synchronously so the caller can select it
// in the dropdown without leaving the page or doing a full refresh.
export default function ClubQuickAdd({ onCreated, onCancel }: { onCreated: (club: Club) => void; onCancel: () => void }) {
  const [values, setValues] = useState<ClubFieldValues>(() => clubToValues());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function set<K extends keyof ClubFieldValues>(key: K, value: ClubFieldValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleCreate() {
    setSaving(true);
    setError("");
    const { club, error: err } = await createClub(clubValuesToFormData(values));
    setSaving(false);
    if (err || !club) {
      setError(err ?? "Could not create the club.");
      return;
    }
    onCreated(club);
  }

  return (
    <div
      style={{ background: "#F3F2EE", border: "1px solid #E4E2DD", padding: "16px 18px", marginBottom: 18 }}
      // This box lives inside the parent event/series form's own <form> —
      // without this, pressing Enter in one of its text inputs would
      // trigger the browser's implicit-submit behavior and hit the
      // *parent* form's submit button (saving the event) instead of
      // creating the club.
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") e.preventDefault();
      }}
    >
      <ClubFields values={values} onChange={set} />

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          type="button"
          disabled={saving}
          onClick={handleCreate}
          className="mono"
          style={{ fontSize: 12.5, fontWeight: 700, color: "#FAFAF8", background: "#111111", border: "none", padding: "10px 18px", cursor: saving ? "default" : "pointer", opacity: saving ? 0.6 : 1 }}
        >
          {saving ? "Adding…" : "Create club"}
        </button>
        <button type="button" onClick={onCancel} className="mono" style={{ fontSize: 12, color: "#6B6B66", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
          Cancel
        </button>
      </div>

      {error && <p style={{ color: "#A13A2A", fontSize: 12.5, marginTop: 12 }}>{error}</p>}
    </div>
  );
}
