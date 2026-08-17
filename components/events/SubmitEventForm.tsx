"use client";

import { useActionState, useState } from "react";
import { submitPublicUrlOrText, submitPublicEventForm, type PublicSubmitState } from "@/lib/actions/public-submit";
import { EVENT_DISCIPLINES } from "@/lib/mock-data";
import { trackEvent } from "@/lib/analytics";
import type { AgeCategory } from "@/lib/types";

const AGE_OPTIONS: AgeCategory[] = ["u8", "u10", "u12", "u14", "u16"];
const REGION_OPTIONS = [
  ["devon", "Devon"],
  ["cornwall", "Cornwall"],
  ["somerset", "Somerset"],
  ["both", "Both (Devon & Cornwall)"],
] as const;

const label: React.CSSProperties = { fontSize: 10.5, color: "#6B6B66", display: "block", marginBottom: 6, letterSpacing: "0.03em" };
const input: React.CSSProperties = { width: "100%", background: "#FFFFFF", border: "1px solid #D8D6D0", color: "#111111", padding: "9px 11px", fontSize: 13.5 };
const field: React.CSSProperties = { marginBottom: 18 };
const row: React.CSSProperties = { display: "flex", gap: 14, flexWrap: "wrap", ...field };
const col: React.CSSProperties = { flex: "1 1 140px" };

type Mode = "link" | "form";

function ModeToggle({ mode, setMode }: { mode: Mode; setMode: (m: Mode) => void }) {
  const tab = (m: Mode, l: string) => (
    <button
      type="button"
      onClick={() => { setMode(m); trackEvent("submit_event_mode", { mode: m }); }}
      className="mono"
      style={{
        padding: "9px 16px",
        fontSize: 11.5,
        fontWeight: 700,
        letterSpacing: "0.03em",
        background: mode === m ? "#111111" : "transparent",
        color: mode === m ? "#FAFAF8" : "#6B6B66",
        border: "1px solid #111111",
        borderRight: m === "link" ? "none" : undefined,
        cursor: "pointer",
      }}
    >
      {l}
    </button>
  );
  return (
    <div style={{ display: "flex", marginBottom: 28 }}>
      {tab("link", "PASTE A LINK OR TEXT")}
      {tab("form", "FILL IN A FORM")}
    </div>
  );
}

function LinkOrTextForm() {
  const [state, formAction, pending] = useActionState<PublicSubmitState, FormData>(submitPublicUrlOrText, {});

  if (state.success) {
    return <p style={{ maxWidth: 460, fontSize: 15, lineHeight: 1.6, color: "#4A4A46" }}>{state.success}</p>;
  }

  return (
    <form action={formAction} style={{ maxWidth: 480 }}>
      <p style={{ fontSize: 13, lineHeight: 1.6, color: "#6B6B66", marginBottom: 20 }}>
        Paste a link to the event page (British Cycling, a club site, Facebook…) or just paste the event text itself. We&apos;ll pull out the details automatically — an admin checks everything before it goes live.
      </p>
      <label className="mono" style={label}>URL OR PASTED TEXT</label>
      <textarea
        name="input"
        required
        placeholder="https://… or paste the event details here"
        style={{ width: "100%", minHeight: 140, background: "#FFFFFF", border: "1px solid #D8D6D0", color: "#111111", padding: "10px 12px", fontSize: 13.5, resize: "vertical" }}
      />
      <button
        type="submit"
        disabled={pending}
        style={{ marginTop: 16, background: "#111111", color: "#FAFAF8", border: "none", padding: "12px 24px", fontWeight: 700, fontSize: 13.5, cursor: pending ? "default" : "pointer", opacity: pending ? 0.6 : 1 }}
      >
        {pending ? "Reading…" : "Submit for review"}
      </button>
      {state.error && <p style={{ color: "#A13A2A", fontSize: 12.5, marginTop: 14 }}>{state.error}</p>}
    </form>
  );
}

function StructuredForm() {
  const [state, formAction, pending] = useActionState<PublicSubmitState, FormData>(submitPublicEventForm, {});
  const [bookingStatus, setBookingStatus] = useState<"open" | "planned">("planned");

  if (state.success) {
    return <p style={{ maxWidth: 460, fontSize: 15, lineHeight: 1.6, color: "#4A4A46" }}>{state.success}</p>;
  }

  return (
    <form action={formAction} style={{ maxWidth: 480 }}>
      <p style={{ fontSize: 13, lineHeight: 1.6, color: "#6B6B66", marginBottom: 24 }}>
        No login needed — an admin reviews every submission before it goes live.
      </p>

      <div style={field}>
        <label className="mono" style={label}>TITLE</label>
        <input style={input} name="title" required />
      </div>

      <div style={row}>
        <div style={col}>
          <label className="mono" style={label}>DISCIPLINE</label>
          <select style={input} name="discipline" defaultValue="" required>
            <option value="" disabled>Select…</option>
            {EVENT_DISCIPLINES.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select>
        </div>
        <div style={col}>
          <label className="mono" style={label}>DATE</label>
          <input style={input} type="date" name="date" required />
        </div>
      </div>

      <div style={field}>
        <label className="mono" style={label}>VENUE</label>
        <input style={input} name="venue_name" required />
      </div>

      <div style={row}>
        <div style={col}>
          <label className="mono" style={label}>ADDRESS (OPTIONAL)</label>
          <input style={input} name="address" />
        </div>
        <div style={col}>
          <label className="mono" style={label}>POSTCODE (OPTIONAL)</label>
          <input style={input} name="postcode" />
        </div>
      </div>

      <div style={field}>
        <label className="mono" style={label}>REGION</label>
        <select style={input} name="region" defaultValue="" required>
          <option value="" disabled>Select…</option>
          {REGION_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      <div style={field}>
        <label className="mono" style={label}>AGE CATEGORIES</label>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          {AGE_OPTIONS.map((a) => (
            <label key={a} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13 }}>
              <input type="checkbox" name="ages" value={a} />
              {a.toUpperCase()}
            </label>
          ))}
        </div>
      </div>

      <div style={field}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
          <input type="checkbox" name="kids_only" />
          Kids only (no adults racing alongside)
        </label>
      </div>

      <div style={row}>
        <div style={col}>
          <label className="mono" style={label}>BOOKING STATUS</label>
          <select style={input} name="booking_status" value={bookingStatus} onChange={(e) => setBookingStatus(e.target.value as typeof bookingStatus)}>
            <option value="planned">Planned (no link yet)</option>
            <option value="open">Open</option>
          </select>
        </div>
        <div style={col}>
          <label className="mono" style={label}>BOOKING LINK{bookingStatus === "open" ? "" : " (OPTIONAL)"}</label>
          <input style={input} type="url" name="booking_link" required={bookingStatus === "open"} />
        </div>
      </div>

      <div style={field}>
        <label className="mono" style={label}>ORGANISER URL (FALLBACK LINK WHILE BOOKING IS PLANNED)</label>
        <input style={input} type="url" name="organiser_url" required />
      </div>

      <div style={row}>
        <div style={col}>
          <label className="mono" style={label}>ORGANISER NAME (OPTIONAL)</label>
          <input style={input} name="organiser_name" />
        </div>
        <div style={col}>
          <label className="mono" style={label}>ORGANISER CONTACT (OPTIONAL)</label>
          <input style={input} name="organiser_contact" />
        </div>
      </div>

      <button
        type="submit"
        disabled={pending}
        style={{ background: "#111111", color: "#FAFAF8", border: "none", padding: "12px 24px", fontWeight: 700, fontSize: 13.5, cursor: pending ? "default" : "pointer", opacity: pending ? 0.6 : 1 }}
      >
        {pending ? "Sending…" : "Submit for review"}
      </button>
      {state.error && <p style={{ color: "#A13A2A", fontSize: 12.5, marginTop: 14 }}>{state.error}</p>}
    </form>
  );
}

export default function SubmitEventForm() {
  const [mode, setMode] = useState<Mode>("link");

  return (
    <div>
      <ModeToggle mode={mode} setMode={setMode} />
      {mode === "link" ? <LinkOrTextForm /> : <StructuredForm />}
    </div>
  );
}
