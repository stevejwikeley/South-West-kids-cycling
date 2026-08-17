"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { saveEvent, deleteEvent, verifyEventFields, type EventFormState } from "@/lib/actions/events";
import { utcIsoToUkLocalParts } from "@/lib/uk-time";
import { EVENT_DISCIPLINES } from "@/lib/mock-data";
import type { EventRow } from "@/lib/supabase/types";
import type { AgeCategory } from "@/lib/types";

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

const label: React.CSSProperties = { fontSize: 10.5, color: "#6B6B66", display: "block", marginBottom: 6, letterSpacing: "0.03em" };
const input: React.CSSProperties = { width: "100%", background: "#FFFFFF", border: "1px solid #D8D6D0", color: "#111111", padding: "9px 11px", fontSize: 13.5 };
const field: React.CSSProperties = { marginBottom: 18 };
// flexWrap + a flex-basis (rather than flex:1 with no basis) so columns wrap
// onto their own line on narrow screens instead of being clipped by the
// page's overflow-x:hidden — flex:1 alone doesn't shrink below content size.
const row: React.CSSProperties = { display: "flex", gap: 14, flexWrap: "wrap", ...field };
const col: React.CSSProperties = { flex: "1 1 140px" };

export default function EventForm({
  event,
  redirectTo,
  onSuccess,
}: {
  event?: EventRow;
  redirectTo: string | null;
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const boundSave = saveEvent.bind(null, redirectTo);
  const [state, formAction, pending] = useActionState<EventFormState, FormData>(boundSave, {});
  const [bookingStatus, setBookingStatus] = useState(event?.booking_status ?? "planned");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [fieldFlags, setFieldFlags] = useState(event?.field_flags ?? null);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState("");

  // saveEvent redirects server-side when redirectTo is set, so this only
  // fires in panel mode (redirectTo null) where it returns { success } instead.
  useEffect(() => {
    if (state.success) onSuccess?.();
  }, [state.success, onSuccess]);

  async function handleVerify() {
    if (!event) return;
    setVerifying(true);
    setVerifyError("");
    const result = await verifyEventFields(event.id);
    setVerifying(false);
    if (result.error) {
      setVerifyError(result.error);
      return;
    }
    setFieldFlags(null);
    router.refresh();
  }

  async function handleDelete() {
    if (!event) return;
    if (!confirm(`Delete "${event.title}"? This can't be undone.`)) return;
    setDeleting(true);
    setDeleteError("");
    const result = await deleteEvent(event.id);
    if (result.error) {
      setDeleting(false);
      setDeleteError(result.error);
      return;
    }
    if (redirectTo) {
      router.push(redirectTo);
    } else {
      onSuccess?.();
    }
    router.refresh();
  }

  const startParts = event ? utcIsoToUkLocalParts(event.start_datetime) : null;

  return (
    <form action={formAction} style={{ maxWidth: 480 }}>
      {event && <input type="hidden" name="id" value={event.id} />}

      {fieldFlags && Object.keys(fieldFlags).length > 0 && (
        <div style={{ background: "#FDF3E4", border: "1px solid #F0DDB0", padding: "12px 14px", marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <span className="mono" style={{ fontSize: 11.5, color: "#946A0E" }}>
            NEEDS VERIFICATION: {Object.keys(fieldFlags).join(", ")}
          </span>
          <button
            type="button"
            disabled={verifying}
            onClick={handleVerify}
            className="mono"
            style={{ fontSize: 11.5, fontWeight: 700, color: "#1F5D3A", background: "none", border: "1px solid #1F5D3A", padding: "7px 14px", cursor: verifying ? "default" : "pointer", opacity: verifying ? 0.6 : 1 }}
          >
            {verifying ? "Verifying…" : "Verify"}
          </button>
        </div>
      )}
      {verifyError && <p style={{ color: "#A13A2A", fontSize: 12.5, marginTop: -12, marginBottom: 20 }}>{verifyError}</p>}

      <div style={field}>
        <label className="mono" style={label}>TITLE</label>
        <input style={input} name="title" defaultValue={event?.title} required />
      </div>

      <div style={row}>
        <div style={col}>
          <label className="mono" style={label}>DISCIPLINE</label>
          <select style={input} name="discipline" defaultValue={event?.discipline ?? ""} required>
            <option value="" disabled>Select…</option>
            {EVENT_DISCIPLINES.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select>
        </div>
        <div style={col}>
          <label className="mono" style={label}>STATUS</label>
          <select style={input} name="status" defaultValue={event?.status ?? "confirmed"}>
            {STATUS_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      </div>

      <div style={field}>
        <label className="mono" style={label}>DATE</label>
        <input style={input} type="date" name="date" defaultValue={startParts?.date} required />
      </div>

      <div style={field}>
        <label className="mono" style={label}>VENUE</label>
        <input style={input} name="venue_name" defaultValue={event?.venue_name} required />
      </div>

      <div style={row}>
        <div style={col}>
          <label className="mono" style={label}>ADDRESS (OPTIONAL)</label>
          <input style={input} name="address" defaultValue={event?.address ?? ""} />
        </div>
        <div style={col}>
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
          <input style={input} type="url" name="booking_link" defaultValue={event?.booking_link ?? ""} required={bookingStatus === "open"} />
        </div>
      </div>

      <div style={field}>
        <label className="mono" style={label}>ORGANISER URL (FALLBACK LINK WHILE BOOKING IS PLANNED)</label>
        <input style={input} type="url" name="organiser_url" defaultValue={event?.organiser_url} required />
      </div>

      <div style={row}>
        <div style={col}>
          <label className="mono" style={label}>ORGANISER NAME (OPTIONAL)</label>
          <input style={input} name="organiser_name" defaultValue={event?.organiser_name ?? ""} />
        </div>
        <div style={col}>
          <label className="mono" style={label}>ORGANISER CONTACT (OPTIONAL)</label>
          <input style={input} name="organiser_contact" defaultValue={event?.organiser_contact ?? ""} />
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          type="submit"
          disabled={pending}
          style={{ background: "#111111", color: "#FAFAF8", border: "none", padding: "12px 24px", fontWeight: 700, fontSize: 13.5, cursor: pending ? "default" : "pointer", opacity: pending ? 0.6 : 1 }}
        >
          {pending ? "Saving…" : event ? "Save changes" : "Publish event"}
        </button>
        {event && (
          <button
            type="button"
            disabled={deleting}
            onClick={handleDelete}
            className="mono"
            style={{ fontSize: 12, fontWeight: 700, color: "#A13A2A", background: "none", border: "1px solid #D8D6D0", padding: "11px 20px", cursor: deleting ? "default" : "pointer", opacity: deleting ? 0.6 : 1 }}
          >
            {deleting ? "Deleting…" : "Delete event"}
          </button>
        )}
      </div>

      {state.error && <p style={{ color: "#A13A2A", fontSize: 12.5, marginTop: 14 }}>{state.error}</p>}
      {deleteError && <p style={{ color: "#A13A2A", fontSize: 12.5, marginTop: 14 }}>{deleteError}</p>}
    </form>
  );
}
