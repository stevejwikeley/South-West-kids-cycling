"use client";

import { downloadCsv } from "@/lib/csv";
import { bookingsToCsv } from "@/lib/csv";
import type { EventBooking } from "@/lib/data";

export default function AttendeesList({ eventTitle, bookings, capacity }: { eventTitle: string; bookings: EventBooking[]; capacity: number | null }) {
  const confirmedCount = bookings.filter((b) => b.status === "confirmed").reduce((sum, b) => sum + b.people.length, 0);
  const waitlistedCount = bookings.filter((b) => b.status === "waitlisted").reduce((sum, b) => sum + b.people.length, 0);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 18 }}>
        <p className="mono" style={{ fontSize: 12, color: "#6B6B66" }}>
          {confirmedCount} confirmed{waitlistedCount > 0 ? `, ${waitlistedCount} waitlisted` : ""}{capacity !== null ? ` / ${capacity} capacity` : ""}
        </p>
        <button
          type="button"
          onClick={() => downloadCsv(`${eventTitle}-attendees.csv`, bookingsToCsv(bookings))}
          className="mono"
          style={{ fontSize: 11.5, fontWeight: 700, color: "#111111", background: "none", border: "1px solid #111111", padding: "8px 16px", cursor: "pointer" }}
        >
          Export CSV
        </button>
      </div>

      {bookings.length === 0 ? (
        <p style={{ color: "#6B6B66", fontSize: 13.5 }}>No signups yet.</p>
      ) : (
        <div style={{ borderTop: "2px solid #111111" }}>
          {bookings.map((b) => (
            <div key={b.id} style={{ padding: "14px 6px", borderBottom: "1px solid #E4E2DD" }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{b.contactName ?? b.email}</div>
              <div className="mono" style={{ fontSize: 10.5, color: "#6B6B66", marginTop: 4 }}>
                {b.email}{b.phone ? ` · ${b.phone}` : ""} · {b.status.toUpperCase()}
              </div>
              <div style={{ fontSize: 13, color: "#4A4A46", marginTop: 6 }}>
                {b.people.map((p) => `${p.name} (${p.age_category.toUpperCase()})`).join(", ")}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
