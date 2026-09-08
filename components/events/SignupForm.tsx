"use client";

import { useActionState, useState } from "react";
import { createBooking, type CreateBookingState } from "@/lib/actions/bookings";
import type { AgeCategory } from "@/lib/types";

const AGE_OPTIONS: AgeCategory[] = ["u8", "u10", "u12", "u14", "u16"];
const label: React.CSSProperties = { fontSize: 10.5, color: "#6B6B66", display: "block", marginBottom: 6, letterSpacing: "0.03em" };
const input: React.CSSProperties = { width: "100%", background: "#FFFFFF", border: "1px solid #D8D6D0", color: "#111111", padding: "9px 11px", fontSize: 13.5 };
const field: React.CSSProperties = { marginBottom: 16 };

export default function SignupForm({ eventId, spacesLeft }: { eventId: string; spacesLeft: number | null }) {
  const boundCreate = createBooking.bind(null, eventId);
  const [state, formAction, pending] = useActionState<CreateBookingState, FormData>(boundCreate, {});
  const [peopleCount, setPeopleCount] = useState(1);

  if (state.success) {
    return (
      <div style={{ background: "#F3F2EE", border: "1px solid #E4E2DD", padding: "20px 22px" }}>
        <p style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>
          {state.success.status === "confirmed" ? "You're in — check your email for confirmation." : "You're on the waitlist — check your email."}
        </p>
      </div>
    );
  }

  const full = spacesLeft === 0;

  return (
    <form action={formAction} style={{ maxWidth: 420, background: "#F3F2EE", border: "1px solid #E4E2DD", padding: "20px 22px" }}>
      <h2 className="disp" style={{ fontSize: 18, marginBottom: 4 }}>
        {full ? "Join the waitlist" : "Sign up"}
      </h2>
      {spacesLeft !== null && (
        <p className="mono" style={{ fontSize: 11, color: "#6B6B66", marginBottom: 16 }}>
          {full ? "FULL" : `${spacesLeft} SPACE${spacesLeft === 1 ? "" : "S"} LEFT`}
        </p>
      )}

      <div style={field}>
        <label className="mono" style={label}>YOUR NAME</label>
        <input style={input} name="contact_name" required />
      </div>
      <div style={field}>
        <label className="mono" style={label}>EMAIL</label>
        <input style={input} type="email" name="email" required />
      </div>
      <div style={field}>
        <label className="mono" style={label}>PHONE (OPTIONAL)</label>
        <input style={input} name="phone" />
      </div>

      {Array.from({ length: peopleCount }).map((_, i) => (
        <div key={i} style={{ display: "flex", gap: 10, ...field }}>
          <div style={{ flex: "1 1 60%" }}>
            <label className="mono" style={label}>{i === 0 ? "CHILD'S NAME" : `PERSON ${i + 1} NAME`}</label>
            <input style={input} name="person_name" required />
          </div>
          <div style={{ flex: "1 1 40%" }}>
            <label className="mono" style={label}>AGE</label>
            <select style={input} name="person_age" defaultValue="" required>
              <option value="" disabled>Select…</option>
              {AGE_OPTIONS.map((a) => <option key={a} value={a}>{a.toUpperCase()}</option>)}
            </select>
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={() => setPeopleCount((n) => n + 1)}
        className="mono"
        style={{ fontSize: 11.5, color: "#111111", background: "none", border: "1px solid #D8D6D0", padding: "7px 14px", cursor: "pointer", marginBottom: 18 }}
      >
        + Add another child
      </button>

      <div>
        <button
          type="submit"
          disabled={pending}
          style={{ background: "#111111", color: "#FAFAF8", border: "none", padding: "12px 24px", fontWeight: 700, fontSize: 13.5, cursor: pending ? "default" : "pointer", opacity: pending ? 0.6 : 1 }}
        >
          {pending ? "Submitting…" : full ? "Join waitlist" : "Book now"}
        </button>
      </div>

      {state.error && <p style={{ color: "#A13A2A", fontSize: 12.5, marginTop: 14 }}>{state.error}</p>}
    </form>
  );
}
