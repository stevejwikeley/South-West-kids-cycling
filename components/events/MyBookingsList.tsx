"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cancelBooking } from "@/lib/actions/bookings";
import { fmtDay } from "@/lib/format";
import type { MyBooking } from "@/lib/data";

export default function MyBookingsList({ bookings }: { bookings: MyBooking[] }) {
  const router = useRouter();
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});

  if (bookings.length === 0) {
    return <p style={{ color: "#6B6B66", fontSize: 13.5 }}>No upcoming bookings.</p>;
  }

  async function handleCancel(id: string) {
    if (!confirm("Cancel this booking?")) return;
    setBusyIds((prev) => new Set(prev).add(id));
    const result = await cancelBooking(id);
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
      {bookings.map((b) => {
        const f = fmtDay(b.event.start_datetime.slice(0, 10));
        const busy = busyIds.has(b.id);
        return (
          <div key={b.id} style={{ padding: "16px 6px", borderBottom: "1px solid #E4E2DD" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{b.event.title}</div>
                <div className="mono" style={{ fontSize: 11.5, color: "#6B6B66", marginTop: 4 }}>
                  {f.day} {f.mon} &middot; {b.event.venue_name} &middot; {b.status === "waitlisted" ? "WAITLISTED" : "CONFIRMED"}
                </div>
                <div style={{ fontSize: 13, color: "#4A4A46", marginTop: 6 }}>
                  {b.people.map((p) => `${p.name} (${p.age_category.toUpperCase()})`).join(", ")}
                </div>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => handleCancel(b.id)}
                className="mono"
                style={{ fontSize: 11.5, color: "#A13A2A", background: "none", border: "1px solid #D8D6D0", padding: "7px 14px", cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1 }}
              >
                {busy ? "Cancelling…" : "Cancel"}
              </button>
            </div>
            {errors[b.id] && <div style={{ fontSize: 12, color: "#A13A2A", marginTop: 6 }}>{errors[b.id]}</div>}
          </div>
        );
      })}
    </div>
  );
}
