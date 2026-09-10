"use client";

import { useState } from "react";
import { researchClubAction } from "@/lib/actions/clubs";
import { CLUB_DISCIPLINES } from "@/lib/mock-data";
import type { ClubDisciplineId } from "@/lib/types";
import type { ClubFieldValues } from "./club-form-values";

const label: React.CSSProperties = { fontSize: 10.5, color: "#6B6B66", display: "block", marginBottom: 6, letterSpacing: "0.03em" };
const input: React.CSSProperties = { width: "100%", background: "#FFFFFF", border: "1px solid #D8D6D0", color: "#111111", padding: "9px 11px", fontSize: 13.5 };
const field: React.CSSProperties = { marginBottom: 18 };
const row: React.CSSProperties = { display: "flex", gap: 14, flexWrap: "wrap", ...field };
const col: React.CSSProperties = { flex: "1 1 140px" };

// The field set shared by the full /admin|organiser/clubs form and the
// inline "+ Add new club" quick-add — no <form> or submit button of its
// own, since the two callers submit very differently (a real form action
// vs. a direct createClub() call). Named-input attributes are only present
// where the caller relies on native <form> serialization (ClubForm); the
// quick-add instead builds FormData itself from the same values.
export default function ClubFields({
  values,
  onChange,
  withNames = false,
}: {
  values: ClubFieldValues;
  onChange: <K extends keyof ClubFieldValues>(key: K, value: ClubFieldValues[K]) => void;
  withNames?: boolean;
}) {
  const [researching, setResearching] = useState(false);
  const [researchNote, setResearchNote] = useState("");

  function toggleDiscipline(id: ClubDisciplineId) {
    onChange("disciplines", values.disciplines.includes(id) ? values.disciplines.filter((d) => d !== id) : [...values.disciplines, id]);
  }

  async function handleLookup() {
    if (!values.name.trim()) {
      setResearchNote("Enter a name first.");
      return;
    }
    setResearching(true);
    setResearchNote("");
    const { result, error } = await researchClubAction(values.name);
    setResearching(false);
    if (error) {
      setResearchNote(error);
      return;
    }
    if (!result?.found) {
      setResearchNote("Couldn't find a confident match online — fill in the details yourself.");
      return;
    }
    if (result.name) onChange("name", result.name);
    if (result.location) onChange("location", result.location);
    if (result.website) onChange("website", result.website);
    if (result.disciplines.length > 0) onChange("disciplines", result.disciplines);
    if (result.age_note) onChange("ageNote", result.age_note);
    if (result.kids_only != null) onChange("kidsOnly", result.kids_only);
    if (result.founded) onChange("founded", result.founded);
    if (result.summary) onChange("summary", result.summary);
    setResearchNote(
      result.low_confidence_fields.length > 0
        ? `Found it — double-check ${result.low_confidence_fields.join(", ")} before saving.`
        : "Found it — review the details below before saving."
    );
  }

  return (
    <>
      <div style={field}>
        <label className="mono" style={label}>NAME</label>
        <div style={{ display: "flex", gap: 8 }}>
          <input style={{ ...input, flex: 1 }} name={withNames ? "name" : undefined} value={values.name} onChange={(e) => onChange("name", e.target.value)} required />
          <button
            type="button"
            disabled={researching}
            onClick={handleLookup}
            className="mono"
            style={{ flexShrink: 0, fontSize: 11.5, fontWeight: 700, color: "#111111", background: "none", border: "1px solid #111111", padding: "0 14px", cursor: researching ? "default" : "pointer", opacity: researching ? 0.6 : 1 }}
          >
            {researching ? "Looking up…" : "Look up online"}
          </button>
        </div>
        {researchNote && <p style={{ fontSize: 12, color: "#6B6B66", marginTop: 6 }}>{researchNote}</p>}
      </div>

      <div style={field}>
        <label className="mono" style={label}>LOCATION</label>
        <input style={input} name={withNames ? "location" : undefined} value={values.location} onChange={(e) => onChange("location", e.target.value)} placeholder="e.g. Newton Abbot, Devon" required />
      </div>

      <div style={field}>
        <label className="mono" style={label}>WEBSITE (OPTIONAL)</label>
        <input style={input} type="url" name={withNames ? "website" : undefined} value={values.website} onChange={(e) => onChange("website", e.target.value)} />
      </div>

      <div style={field}>
        <label className="mono" style={label}>DISCIPLINES</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {CLUB_DISCIPLINES.map((d) => {
            const active = values.disciplines.includes(d.id as ClubDisciplineId);
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => toggleDiscipline(d.id as ClubDisciplineId)}
                style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 13px", borderRadius: 999, border: `1px solid ${active ? d.color : "#D8D6D0"}`, background: active ? d.color : "transparent", color: active ? "#FAFAF8" : "#4A4A46", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
              >
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: active ? "#FAFAF8" : d.color }} />
                {d.label}
              </button>
            );
          })}
          {withNames && values.disciplines.map((d) => <input key={d} type="hidden" name="disciplines" value={d} />)}
        </div>
      </div>

      <div style={row}>
        <div style={col}>
          <label className="mono" style={label}>AGE NOTE (OPTIONAL)</label>
          <input style={input} name={withNames ? "age_note" : undefined} value={values.ageNote} onChange={(e) => onChange("ageNote", e.target.value)} placeholder="e.g. Go-Ride youth section, ages 8-16" />
        </div>
        <div style={col}>
          <label className="mono" style={label}>FOUNDED (OPTIONAL)</label>
          <input style={input} name={withNames ? "founded" : undefined} value={values.founded} onChange={(e) => onChange("founded", e.target.value)} placeholder="e.g. 1930" />
        </div>
      </div>

      <div style={field}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
          <input type="checkbox" name={withNames ? "kids_only" : undefined} checked={values.kidsOnly} onChange={(e) => onChange("kidsOnly", e.target.checked)} />
          Youth only (no separate adult racing programme)
        </label>
      </div>

      <div style={field}>
        <label className="mono" style={label}>SUMMARY (OPTIONAL)</label>
        <textarea
          style={{ ...input, minHeight: 80, resize: "vertical" }}
          name={withNames ? "summary" : undefined}
          value={values.summary}
          onChange={(e) => onChange("summary", e.target.value)}
        />
      </div>
    </>
  );
}
