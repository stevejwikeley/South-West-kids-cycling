"use client";

import { useActionState, useEffect, useState } from "react";
import { submitContactForm, type ContactFormState } from "@/lib/actions/contact";
import { trackEvent } from "@/lib/analytics";

const label: React.CSSProperties = { fontSize: 10.5, color: "#6B6B66", display: "block", marginBottom: 6, letterSpacing: "0.03em" };
const input: React.CSSProperties = { width: "100%", background: "#FFFFFF", border: "1px solid #D8D6D0", color: "#111111", padding: "9px 11px", fontSize: 13.5 };
const field: React.CSSProperties = { marginBottom: 18 };

export default function ContactForm({ defaultReason = "general" }: { defaultReason?: string }) {
  const [state, formAction, pending] = useActionState<ContactFormState, FormData>(submitContactForm, {});
  const [reason, setReason] = useState(defaultReason);

  useEffect(() => {
    if (state.success) trackEvent("contact_form_submit", { reason });
  }, [state.success, reason]);

  if (state.success) {
    return (
      <p style={{ maxWidth: 420, fontSize: 15, lineHeight: 1.6, color: "#4A4A46" }}>
        Thanks — your message has been sent. We&apos;ll get back to you as soon as we can.
      </p>
    );
  }

  return (
    <form action={formAction} style={{ maxWidth: 480 }}>
      <div style={field}>
        <label className="mono" style={label}>NAME</label>
        <input style={input} name="name" required />
      </div>

      <div style={field}>
        <label className="mono" style={label}>EMAIL</label>
        <input style={input} type="email" name="email" required />
      </div>

      <div style={field}>
        <label className="mono" style={label}>REASON</label>
        <select style={input} name="reason" value={reason} onChange={(e) => setReason(e.target.value)}>
          <option value="general">General enquiry</option>
          <option value="organiser">Request organiser account</option>
        </select>
      </div>

      <div style={field}>
        <label className="mono" style={label}>MESSAGE</label>
        <textarea style={{ ...input, minHeight: 120, resize: "vertical" }} name="message" required />
      </div>

      <button
        type="submit"
        disabled={pending}
        style={{ background: "#111111", color: "#FAFAF8", border: "none", padding: "12px 24px", fontWeight: 700, fontSize: 13.5, cursor: pending ? "default" : "pointer", opacity: pending ? 0.6 : 1 }}
      >
        {pending ? "Sending…" : "Send message"}
      </button>

      {state.error && <p style={{ color: "#A13A2A", fontSize: 12.5, marginTop: 14 }}>{state.error}</p>}
    </form>
  );
}
