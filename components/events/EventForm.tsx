"use client";

import { useActionState, useState } from "react";
import { saveEvent, type EventFormState } from "@/lib/actions/events";
import { utcIsoToUkLocalParts } from "@/lib/uk-time";
import { EVENT_DISCIPLINES } from "@/lib/mock-data";
import type { EventRow } from "@/lib/supabase/types";
import type { AgeCategory } from "@/lib/types";

const AGE_OPTIONS: AgeCategory[] = ["u8", "u10", "u12", "u14", "u16"];
const REGION_OPTIONS = [
  ["devon", "Devon"],
  ["cornwall", "Cornwall"],
  ["both", "Both"],
] as const;
const STATUS_OPTIONS = [
  ["confirmed", "Confirmed"],
  ["provisional", "Provisional"],
  ["cancelled", "Cancelled"],
] as const;

const label: React.CSSProperties = { fontSize: 10.5, color: "#6B6B66", display: "block", marginBottom: 6, letterSpacing: "0.03em" };
const input: React.CSSProperties = { width: "100%", background: "#FFFFFF", border: "1px solid #D8D6D0", color: "#111111", padding: "9px 11px", fontSize: 13.5 };
const field: React.CSSProperties = { marginBottom: 18 };

export default function EventForm({ event, redirectTo }: { event?: EventRow; redirectTo: string }) {
  const boundSave = saveEvent.bind(null, redirectTo);
  const [state, formAction, pending] = useActionState<EventFormState, FormData>(boundSave, {});
  const [allDay, setAllDay] = useState(event?.all_day ?? true);
  const [bookingStatus, setBookingStatus] = useState(event?.booking_status ?? "planned");

  const startParts = event ? utcIsoToUkLocalParts(event.start_datetime) : null;
  const endParts = event?.end_datetime ? utcIsoToUkLocalParts(event.end_datetime) : null;

  return (
    <form action={formAction} style={{ maxWidth: 480 }}>
      {event && <input type="hidden" name="id" value={event.id} />}

      <div style={field}>
        <label className="mono" style={label}>TITLE</label>
        <input style={input} name="title" defaultValue={event?.title} required />
      </div>

      <div style={{ display: "flex", gap: 14, ...field }}>
        <div style={{ flex: 1 }}>
          <label className="mono" style={label}>DISCIPLINE</label>
          <select style={input} name="discipline" defaultValue={event?.discipline ?? ""} required>
            <option value="" disabled>Select…</option>
            {EVENT_DISCIPLINES.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label className="mono" style={label}>STATUS</label>
          <select style={input} name="status" defaultValue={event?.status ?? "confirmed"}>
            {STATUS_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      </div>

      <div style={field}>
        <label className="mono" style={{ ...label, display: "flex", alignItems: "center", gap: 8 }}>
          <input type="checkbox" name="all_day" defaultChecked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
          ALL DAY (NO SPECIFIC TIME)
        </label>
      </div>

      <div style={{ display: "flex", gap: 14, ...field }}>
        <div style={{ flex: 1 }}>
          <label className="mono" style={label}>DATE</label>
          <input style={input} type="date" name="date" defaultValue={startParts?.date} required />
        </div>
        {!allDay && (
          <>
            <div style={{ flex: 1 }}>
              <label className="mono" style={label}>START TIME</label>
              <input style={input} type="time" name="start_time" defaultValue={startParts?.time} />
            </div>
            <div style={{ flex: 1 }}>
              <label className="mono" style={label}>END TIME</label>
              <input style={input} type="time" name="end_time" defaultValue={endParts?.time} />
            </div>
          </>
        )}
      </div>

      <div style={field}>
        <label className="mono" style={label}>VENUE</label>
        <input style={input} name="venue_name" defaultValue={event?.venue_name} required />
      </div>

      <div style={{ display: "flex", gap: 14, ...field }}>
        <div style={{ flex: 1 }}>
          <label className="mono" style={label}>ADDRESS (OPTIONAL)</label>
          <input style={input} name="address" defaultValue={event?.address ?? ""} />
        </div>
        <div style={{ flex: 1 }}>
          <label className="mono" style={label}>POSTCODE (OPTIONAL)</label>
          <input style={input} name="postcode" defaultValue={event?.postcode ?? ""} />
        </div>
      </div>

      <div style={field}>
        <label className="mono" style={label}>REGION</label>
        <select style={input} name="region" defaultValue={event?.region ?? ""} required>
          <option value="" disabled>Select…</option>
          {REGION_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      <div style={field}>
        <label className="mono" style={label}>AGE CATEGORIES</label>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          {AGE_OPTIONS.map((a) => (
            <label key={a} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13 }}>
              <input type="checkbox" name="ages" value={a} defaultChecked={event?.age_categories?.includes(a)} />
              {a.toUpperCase()}
            </label>
          ))}
        </div>
      </div>

      <div style={field}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
          <input type="checkbox" name="kids_only" defaultChecked={event?.kids_only} />
          Kids only (no adults racing alongside)
        </label>
      </div>

      <div style={{ display: "flex", gap: 14, ...field }}>
        <div style={{ flex: 1 }}>
          <label className="mono" style={label}>BOOKING STATUS</label>
          <select style={input} name="booking_status" value={bookingStatus} onChange={(e) => setBookingStatus(e.target.value as typeof bookingStatus)}>
            <option value="planned">Planned (no link yet)</option>
            <option value="open">Open</option>
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label className="mono" style={label}>BOOKING LINK{bookingStatus === "open" ? "" : " (OPTIONAL)"}</label>
          <input style={input} type="url" name="booking_link" defaultValue={event?.booking_link ?? ""} required={bookingStatus === "open"} />
        </div>
      </div>

      <div style={field}>
        <label className="mono" style={label}>ORGANISER URL (FALLBACK LINK WHILE BOOKING IS PLANNED)</label>
        <input style={input} type="url" name="organiser_url" defaultValue={event?.organiser_url} required />
      </div>

      <div style={{ display: "flex", gap: 14, ...field }}>
        <div style={{ flex: 1 }}>
          <label className="mono" style={label}>ORGANISER NAME (OPTIONAL)</label>
          <input style={input} name="organiser_name" defaultValue={event?.organiser_name ?? ""} />
        </div>
        <div style={{ flex: 1 }}>
          <label className="mono" style={label}>ORGANISER CONTACT (OPTIONAL)</label>
          <input style={input} name="organiser_contact" defaultValue={event?.organiser_contact ?? ""} />
        </div>
      </div>

      <button
        type="submit"
        disabled={pending}
        style={{ background: "#111111", color: "#FAFAF8", border: "none", padding: "12px 24px", fontWeight: 700, fontSize: 13.5, cursor: pending ? "default" : "pointer", opacity: pending ? 0.6 : 1 }}
      >
        {pending ? "Saving…" : event ? "Save changes" : "Publish event"}
      </button>

      {state.error && <p style={{ color: "#A13A2A", fontSize: 12.5, marginTop: 14 }}>{state.error}</p>}
    </form>
  );
}
