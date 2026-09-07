"use client";

import { useActionState } from "react";
import { messageAttendees, type MessageAttendeesState } from "@/lib/actions/bookings";

const label: React.CSSProperties = { fontSize: 10.5, color: "#6B6B66", display: "block", marginBottom: 6, letterSpacing: "0.03em" };
const input: React.CSSProperties = { width: "100%", background: "#FFFFFF", border: "1px solid #D8D6D0", color: "#111111", padding: "9px 11px", fontSize: 13.5 };

export default function MessageAttendeesForm({ eventId }: { eventId: string }) {
  const boundMessage = messageAttendees.bind(null, eventId);
  const [state, formAction, pending] = useActionState<MessageAttendeesState, FormData>(boundMessage, {});

  return (
    <form action={formAction} style={{ maxWidth: 480, marginTop: 32, background: "#F3F2EE", border: "1px solid #E4E2DD", padding: "18px 20px" }}>
      <h3 className="disp" style={{ fontSize: 16, marginBottom: 14 }}>Message attendees</h3>
      <div style={{ marginBottom: 14 }}>
        <label className="mono" style={label}>SUBJECT</label>
        <input style={input} name="subject" required />
      </div>
      <div style={{ marginBottom: 14 }}>
        <label className="mono" style={label}>MESSAGE</label>
        <textarea style={{ ...input, minHeight: 100 }} name="body" required />
      </div>
      <button
        type="submit"
        disabled={pending}
        style={{ background: "#111111", color: "#FAFAF8", border: "none", padding: "11px 20px", fontWeight: 700, fontSize: 13, cursor: pending ? "default" : "pointer", opacity: pending ? 0.6 : 1 }}
      >
        {pending ? "Sending…" : "Send to confirmed attendees"}
      </button>
      {state.success && <p style={{ color: "#1F5D3A", fontSize: 12.5, marginTop: 12 }}>{state.success}</p>}
      {state.error && <p style={{ color: "#A13A2A", fontSize: 12.5, marginTop: 12 }}>{state.error}</p>}
    </form>
  );
}
