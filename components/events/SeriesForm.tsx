"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { saveSeries, deleteSeries, type SeriesFormState } from "@/lib/actions/event-series";
import { EVENT_DISCIPLINES } from "@/lib/mock-data";
import ClubSelect from "@/components/clubs/ClubSelect";
import type { EventSeriesRow } from "@/lib/supabase/types";
import type { SeriesPrefill } from "@/lib/actions/parse-series-form";
import type { AgeCategory, Club } from "@/lib/types";

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
const WEEKDAY_OPTIONS = [
  [1, "Mon"],
  [2, "Tue"],
  [3, "Wed"],
  [4, "Thu"],
  [5, "Fri"],
  [6, "Sat"],
  [7, "Sun"],
] as const;

const label: React.CSSProperties = { fontSize: 10.5, color: "#6B6B66", display: "block", marginBottom: 6, letterSpacing: "0.03em" };
const input: React.CSSProperties = { width: "100%", background: "#FFFFFF", border: "1px solid #D8D6D0", color: "#111111", padding: "9px 11px", fontSize: 13.5 };
const field: React.CSSProperties = { marginBottom: 18 };
const row: React.CSSProperties = { display: "flex", gap: 14, flexWrap: "wrap", ...field };
const col: React.CSSProperties = { flex: "1 1 140px" };

export default function SeriesForm({
  series,
  prefill,
  clubs = [],
  fromEventId,
  redirectTo,
}: {
  series?: EventSeriesRow;
  prefill?: SeriesPrefill;
  clubs?: Club[];
  fromEventId?: string;
  redirectTo: string;
}) {
  const router = useRouter();
  const boundSave = saveSeries.bind(null, redirectTo);
  const [state, formAction, pending] = useActionState<SeriesFormState, FormData>(boundSave, {});
  // series (editing) takes priority; prefill (converting a one-off event to
  // recurring) only applies when creating brand new.
  const base = series ?? prefill;
  const [bookingStatus, setBookingStatus] = useState(base?.booking_status ?? "planned");
  const [clubId, setClubId] = useState(base?.club_id ?? "");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  async function handleDelete() {
    if (!series) return;
    if (!confirm(`Delete the recurring series "${series.title}"? Occurrences you've individually edited will be kept as standalone events; the rest will be removed. This can't be undone.`)) return;
    setDeleting(true);
    setDeleteError("");
    const result = await deleteSeries(series.id);
    if (result.error) {
      setDeleting(false);
      setDeleteError(result.error);
      return;
    }
    router.push(redirectTo);
    router.refresh();
  }

  return (
    <form action={formAction} style={{ maxWidth: 480 }}>
      {series && <input type="hidden" name="id" value={series.id} />}
      {fromEventId && <input type="hidden" name="from_event_id" value={fromEventId} />}

      {fromEventId && (
        <div style={{ background: "#F3F2EE", border: "1px solid #E4E2DD", padding: "12px 14px", marginBottom: 20, fontSize: 12.5, color: "#4A4A46", lineHeight: 1.5 }}>
          Converting this event to a recurring series. Pick the days it repeats on and an end date below — saving will replace the original one-off event with the new series.
        </div>
      )}

      <div style={field}>
        <label className="mono" style={label}>TITLE</label>
        <input style={input} name="title" defaultValue={base?.title} required />
      </div>

      <div style={row}>
        <div style={col}>
          <label className="mono" style={label}>DISCIPLINE</label>
          <select style={input} name="discipline" defaultValue={base?.discipline ?? ""} required>
            <option value="" disabled>Select…</option>
            {EVENT_DISCIPLINES.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select>
        </div>
        <div style={col}>
          <label className="mono" style={label}>STATUS</label>
          <select style={input} name="status" defaultValue={base?.status ?? "confirmed"}>
            {STATUS_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      </div>

      <div style={field}>
        <label className="mono" style={label}>REPEATS ON</label>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {WEEKDAY_OPTIONS.map(([v, l]) => (
            <label key={v} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13 }}>
              <input type="checkbox" name="weekdays" value={v} defaultChecked={series?.weekdays?.includes(v)} />
              {l}
            </label>
          ))}
        </div>
      </div>

      <div style={row}>
        <div style={col}>
          <label className="mono" style={label}>STARTS ON</label>
          <input style={input} type="date" name="start_date" defaultValue={base?.start_date} required />
        </div>
        <div style={col}>
          <label className="mono" style={label}>REPEATS UNTIL</label>
          <input style={input} type="date" name="until_date" defaultValue={series?.until_date} required />
        </div>
      </div>

      <div style={field}>
        <label className="mono" style={label}>VENUE</label>
        <input style={input} name="venue_name" defaultValue={base?.venue_name} required />
      </div>

      <div style={row}>
        <div style={col}>
          <label className="mono" style={label}>ADDRESS (OPTIONAL)</label>
          <input style={input} name="address" defaultValue={base?.address ?? ""} />
        </div>
        <div style={col}>
          <label className="mono" style={label}>POSTCODE (OPTIONAL)</label>
          <input style={input} name="postcode" defaultValue={base?.postcode ?? ""} />
        </div>
      </div>

      <div style={field}>
        <label className="mono" style={label}>REGION</label>
        <select style={input} name="region" defaultValue={base?.region ?? ""} required>
          <option value="" disabled>Select…</option>
          {REGION_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      <div style={field}>
        <label className="mono" style={label}>AGE CATEGORIES</label>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          {AGE_OPTIONS.map((a) => (
            <label key={a} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13 }}>
              <input type="checkbox" name="ages" value={a} defaultChecked={base?.age_categories?.includes(a)} />
              {a.toUpperCase()}
            </label>
          ))}
        </div>
      </div>

      <div style={field}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
          <input type="checkbox" name="kids_only" defaultChecked={base?.kids_only} />
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
          <input style={input} type="url" name="booking_link" defaultValue={base?.booking_link ?? ""} required={bookingStatus === "open"} />
        </div>
      </div>

      <div style={field}>
        <label className="mono" style={label}>ORGANISER URL (FALLBACK LINK WHILE BOOKING IS PLANNED)</label>
        <input style={input} type="url" name="organiser_url" defaultValue={base?.organiser_url} required />
      </div>

      <div style={row}>
        <div style={col}>
          <label className="mono" style={label}>ORGANISER NAME (OPTIONAL)</label>
          <input style={input} name="organiser_name" defaultValue={base?.organiser_name ?? ""} />
        </div>
        <div style={col}>
          <label className="mono" style={label}>ORGANISER CONTACT (OPTIONAL)</label>
          <input style={input} name="organiser_contact" defaultValue={base?.organiser_contact ?? ""} />
        </div>
      </div>

      <ClubSelect clubs={clubs} value={clubId} onChange={setClubId} />

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          type="submit"
          disabled={pending}
          style={{ background: "#111111", color: "#FAFAF8", border: "none", padding: "12px 24px", fontWeight: 700, fontSize: 13.5, cursor: pending ? "default" : "pointer", opacity: pending ? 0.6 : 1 }}
        >
          {pending ? "Saving…" : series ? "Save series" : "Create series"}
        </button>
        {series && (
          <button
            type="button"
            disabled={deleting}
            onClick={handleDelete}
            className="mono"
            style={{ fontSize: 12, fontWeight: 700, color: "#A13A2A", background: "none", border: "1px solid #D8D6D0", padding: "11px 20px", cursor: deleting ? "default" : "pointer", opacity: deleting ? 0.6 : 1 }}
          >
            {deleting ? "Deleting…" : "Delete series"}
          </button>
        )}
      </div>

      {state.error && <p style={{ color: "#A13A2A", fontSize: 12.5, marginTop: 14 }}>{state.error}</p>}
      {deleteError && <p style={{ color: "#A13A2A", fontSize: 12.5, marginTop: 14 }}>{deleteError}</p>}
    </form>
  );
}
