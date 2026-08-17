"use client";

import { useState } from "react";
import { updatePending } from "@/lib/actions/pending";
import { utcIsoToUkLocalParts } from "@/lib/uk-time";
import { EVENT_DISCIPLINES } from "@/lib/mock-data";
import type {
  AgeCategory,
  BookingStatusType,
  DisciplineType,
  EventPendingRow,
  EventRow,
  EventStatus,
  RegionType,
} from "@/lib/supabase/types";

const AGE_OPTIONS: AgeCategory[] = ["u8", "u10", "u12", "u14", "u16"];
const REGION_OPTIONS = [
  ["devon", "Devon"],
  ["cornwall", "Cornwall"],
  ["somerset", "Somerset"],
  ["both", "Both (Devon & Cornwall)"],
] as const;
const STATUS_OPTIONS = [
  ["confirmed", "Confirmed"],
  ["provisional", "Provisional"],
  ["cancelled", "Cancelled"],
] as const;

const labelStyle: React.CSSProperties = { fontSize: 10.5, color: "#6B6B66", display: "block", marginBottom: 6, letterSpacing: "0.03em" };
const inputStyle: React.CSSProperties = { width: "100%", background: "#FFFFFF", border: "1px solid #D8D6D0", color: "#111111", padding: "9px 11px", fontSize: 13.5 };
const fieldStyle: React.CSSProperties = { marginBottom: 16 };
const rowStyle: React.CSSProperties = { display: "flex", gap: 12, flexWrap: "wrap", ...fieldStyle };
const colStyle: React.CSSProperties = { flex: "1 1 140px" };

interface FormValues {
  title: string;
  discipline: DisciplineType | "";
  status: EventStatus;
  date: string;
  venue_name: string;
  address: string;
  postcode: string;
  region: RegionType | "";
  age_categories: AgeCategory[];
  kids_only: boolean;
  booking_status: BookingStatusType;
  booking_link: string;
  organiser_url: string;
  organiser_name: string;
  organiser_contact: string;
}

type Diff = Record<string, { from: unknown; to: unknown }>;

// A change_request row only stores fields that differ from the live event
// (in diff_against); a smart_ingest row stores every field directly. Either
// way, this resolves "what should the form show right now" to one shape.
function resolveField(row: EventPendingRow, liveEvent: EventRow | null, key: string): unknown {
  if (row.source_type === "change_request") {
    const diff = (row.diff_against as Diff | null) ?? {};
    if (key in diff) return diff[key].to;
    return liveEvent ? (liveEvent as unknown as Record<string, unknown>)[key] : null;
  }
  return (row as unknown as Record<string, unknown>)[key] ?? null;
}

function computeInitial(row: EventPendingRow, liveEvent: EventRow | null): FormValues {
  const startDatetime = resolveField(row, liveEvent, "start_datetime") as string | null;
  const startParts = startDatetime ? utcIsoToUkLocalParts(startDatetime) : null;

  return {
    title: (resolveField(row, liveEvent, "title") as string) ?? "",
    discipline: (resolveField(row, liveEvent, "discipline") as DisciplineType) ?? "",
    status: (resolveField(row, liveEvent, "status") as EventStatus) ?? "confirmed",
    date: startParts?.date ?? "",
    venue_name: (resolveField(row, liveEvent, "venue_name") as string) ?? "",
    address: (resolveField(row, liveEvent, "address") as string) ?? "",
    postcode: (resolveField(row, liveEvent, "postcode") as string) ?? "",
    region: (resolveField(row, liveEvent, "region") as RegionType) ?? "",
    age_categories: (resolveField(row, liveEvent, "age_categories") as AgeCategory[]) ?? [],
    kids_only: (resolveField(row, liveEvent, "kids_only") as boolean) ?? false,
    booking_status: (resolveField(row, liveEvent, "booking_status") as BookingStatusType) ?? "planned",
    booking_link: (resolveField(row, liveEvent, "booking_link") as string) ?? "",
    organiser_url: (resolveField(row, liveEvent, "organiser_url") as string) ?? "",
    organiser_name: (resolveField(row, liveEvent, "organiser_name") as string) ?? "",
    organiser_contact: (resolveField(row, liveEvent, "organiser_contact") as string) ?? "",
  };
}

// Spec 4.2: a field can be populated but flagged "needs verification" —
// distinct from the live-event hint, which is about disagreement between
// two sources rather than the extraction's own uncertainty.
function FlagNote({ note }: { note?: string }) {
  if (!note) return null;
  return (
    <span className="mono" style={{ display: "block", marginTop: 4, fontSize: 10.5, color: "#9A6B00" }}>
      ⚠ needs verification
    </span>
  );
}

function fmt(v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v);
}

// Shows "Live event has: X · Use this" under a field when the matched live
// event's value differs from what's currently in the form — the concrete
// case of "an event link in one place but not another" made visible instead
// of silently overwritten on approve.
function LiveHint({ liveValue, onUse }: { liveValue: string; onUse: () => void }) {
  if (!liveValue) return null;
  return (
    <button
      type="button"
      onClick={onUse}
      className="mono"
      style={{ display: "block", marginTop: 4, fontSize: 10.5, color: "#9A6B00", background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}
    >
      Live event has: <span style={{ textDecoration: "underline" }}>{liveValue}</span> · use this
    </button>
  );
}

export default function PendingEditPanel({
  row,
  liveEvent,
  onClose,
  onSaved,
}: {
  row: EventPendingRow;
  liveEvent: EventRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [values, setValues] = useState<FormValues>(() => computeInitial(row, liveEvent));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function set<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function liveFor(key: string): string {
    if (!liveEvent) return "";
    const raw = (liveEvent as unknown as Record<string, unknown>)[key];
    const formatted = fmt(raw);
    const current = fmt((values as unknown as Record<string, unknown>)[key === "start_datetime" ? "date" : key]);
    return formatted && formatted !== current ? formatted : "";
  }

  async function handleSave() {
    setSaving(true);
    setError("");

    const formData = new FormData();
    formData.set("title", values.title);
    formData.set("discipline", values.discipline);
    formData.set("status", values.status);
    formData.set("date", values.date);
    formData.set("venue_name", values.venue_name);
    formData.set("address", values.address);
    formData.set("postcode", values.postcode);
    formData.set("region", values.region);
    values.age_categories.forEach((a) => formData.append("ages", a));
    if (values.kids_only) formData.set("kids_only", "on");
    formData.set("booking_status", values.booking_status);
    formData.set("booking_link", values.booking_link);
    formData.set("organiser_url", values.organiser_url);
    formData.set("organiser_name", values.organiser_name);
    formData.set("organiser_contact", values.organiser_contact);

    const result = await updatePending(row.id, formData);
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onSaved();
  }

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(17,17,17,0.35)", zIndex: 40 }} />
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          height: "100vh",
          width: "min(480px, 100vw)",
          background: "#FAFAF8",
          borderLeft: "2px solid #111111",
          zIndex: 41,
          overflowY: "auto",
          padding: "28px 24px 100px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <h2 className="disp" style={{ fontSize: 20, margin: 0 }}>Edit before approving</h2>
          <button type="button" onClick={onClose} className="mono" style={{ background: "none", border: "1px solid #D8D6D0", padding: "6px 10px", cursor: "pointer", fontSize: 12 }}>
            Close
          </button>
        </div>

        {liveEvent && (
          <p style={{ fontSize: 12.5, color: "#4A4A46", background: "#F3F2EE", padding: "10px 12px", marginBottom: 20 }}>
            Matches the live event <strong>{liveEvent.title}</strong>. Fields with a live-event hint show where the two sources disagree — approving applies whatever is in the form.
          </p>
        )}

        <div style={fieldStyle}>
          <label className="mono" style={labelStyle}>TITLE</label>
          <input style={inputStyle} value={values.title} onChange={(e) => set("title", e.target.value)} />
          <LiveHint liveValue={liveFor("title")} onUse={() => set("title", liveFor("title"))} />
        </div>

        <div style={rowStyle}>
          <div style={colStyle}>
            <label className="mono" style={labelStyle}>DISCIPLINE</label>
            <select style={inputStyle} value={values.discipline} onChange={(e) => set("discipline", e.target.value as DisciplineType)}>
              <option value="">Select…</option>
              {EVENT_DISCIPLINES.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
            </select>
          </div>
          <div style={colStyle}>
            <label className="mono" style={labelStyle}>STATUS</label>
            <select style={inputStyle} value={values.status} onChange={(e) => set("status", e.target.value as EventStatus)}>
              {STATUS_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        </div>

        <div style={fieldStyle}>
          <label className="mono" style={labelStyle}>DATE</label>
          <input style={inputStyle} type="date" value={values.date} onChange={(e) => set("date", e.target.value)} />
          <LiveHint liveValue={liveFor("start_datetime") ? liveFor("start_datetime").slice(0, 10) : ""} onUse={() => liveEvent && set("date", utcIsoToUkLocalParts(liveEvent.start_datetime).date)} />
        </div>

        <div style={fieldStyle}>
          <label className="mono" style={labelStyle}>VENUE</label>
          <input style={inputStyle} value={values.venue_name} onChange={(e) => set("venue_name", e.target.value)} />
          <FlagNote note={row.field_flags?.venue_name} />
          <LiveHint liveValue={liveFor("venue_name")} onUse={() => set("venue_name", liveFor("venue_name"))} />
        </div>

        <div style={rowStyle}>
          <div style={colStyle}>
            <label className="mono" style={labelStyle}>ADDRESS</label>
            <input style={inputStyle} value={values.address} onChange={(e) => set("address", e.target.value)} />
            <FlagNote note={row.field_flags?.address} />
          </div>
          <div style={colStyle}>
            <label className="mono" style={labelStyle}>POSTCODE</label>
            <input style={inputStyle} value={values.postcode} onChange={(e) => set("postcode", e.target.value)} />
            <FlagNote note={row.field_flags?.postcode} />
          </div>
        </div>

        <div style={fieldStyle}>
          <label className="mono" style={labelStyle}>REGION</label>
          <select style={inputStyle} value={values.region} onChange={(e) => set("region", e.target.value as RegionType)}>
            <option value="">Select…</option>
            {REGION_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>

        <div style={fieldStyle}>
          <label className="mono" style={labelStyle}>AGE CATEGORIES</label>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            {AGE_OPTIONS.map((a) => (
              <label key={a} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={values.age_categories.includes(a)}
                  onChange={(e) =>
                    set("age_categories", e.target.checked ? [...values.age_categories, a] : values.age_categories.filter((x) => x !== a))
                  }
                />
                {a.toUpperCase()}
              </label>
            ))}
          </div>
        </div>

        <div style={fieldStyle}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <input type="checkbox" checked={values.kids_only} onChange={(e) => set("kids_only", e.target.checked)} />
            Kids only
          </label>
        </div>

        <div style={rowStyle}>
          <div style={colStyle}>
            <label className="mono" style={labelStyle}>BOOKING STATUS</label>
            <select style={inputStyle} value={values.booking_status} onChange={(e) => set("booking_status", e.target.value as BookingStatusType)}>
              <option value="planned">Planned</option>
              <option value="open">Open</option>
            </select>
          </div>
          <div style={colStyle}>
            <label className="mono" style={labelStyle}>BOOKING LINK</label>
            <input style={inputStyle} type="url" value={values.booking_link} onChange={(e) => set("booking_link", e.target.value)} />
            <FlagNote note={row.field_flags?.booking_link} />
            <LiveHint liveValue={liveFor("booking_link")} onUse={() => set("booking_link", liveFor("booking_link"))} />
          </div>
        </div>

        <div style={fieldStyle}>
          <label className="mono" style={labelStyle}>ORGANISER URL</label>
          <input style={inputStyle} type="url" value={values.organiser_url} onChange={(e) => set("organiser_url", e.target.value)} />
          <FlagNote note={row.field_flags?.organiser_url} />
          <LiveHint liveValue={liveFor("organiser_url")} onUse={() => set("organiser_url", liveFor("organiser_url"))} />
        </div>

        <div style={rowStyle}>
          <div style={colStyle}>
            <label className="mono" style={labelStyle}>ORGANISER NAME</label>
            <input style={inputStyle} value={values.organiser_name} onChange={(e) => set("organiser_name", e.target.value)} />
          </div>
          <div style={colStyle}>
            <label className="mono" style={labelStyle}>ORGANISER CONTACT</label>
            <input style={inputStyle} value={values.organiser_contact} onChange={(e) => set("organiser_contact", e.target.value)} />
          </div>
        </div>

        <button
          type="button"
          disabled={saving}
          onClick={handleSave}
          style={{ background: "#111111", color: "#FAFAF8", border: "none", padding: "12px 24px", fontWeight: 700, fontSize: 13.5, cursor: saving ? "default" : "pointer", opacity: saving ? 0.6 : 1 }}
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
        {error && <p style={{ color: "#A13A2A", fontSize: 12.5, marginTop: 14 }}>{error}</p>}
      </div>
    </>
  );
}
