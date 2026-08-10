"use client";

import { useActionState } from "react";
import { inviteOrganiser } from "./actions";

export default function InviteOrganiserForm() {
  const [state, formAction, pending] = useActionState(inviteOrganiser, {});

  return (
    <form action={formAction}>
      <label className="mono" style={{ fontSize: 10.5, color: "#6B6B66", display: "block", marginBottom: 6 }}>EMAIL</label>
      <input
        type="email"
        name="email"
        required
        placeholder="organiser@club.co.uk"
        style={{ width: "100%", background: "#FFFFFF", border: "1px solid #D8D6D0", color: "#111111", padding: "10px 12px", fontSize: 14, marginBottom: 14 }}
      />
      <button
        type="submit"
        disabled={pending}
        style={{ background: "#111111", color: "#FAFAF8", border: "none", padding: "10px 20px", fontWeight: 700, fontSize: 13, cursor: pending ? "default" : "pointer", opacity: pending ? 0.6 : 1 }}
      >
        {pending ? "Sending…" : "Send invite"}
      </button>
      {state.error && <p style={{ color: "#A13A2A", fontSize: 12.5, marginTop: 12 }}>{state.error}</p>}
      {state.success && <p style={{ color: "#1F5D3A", fontSize: 12.5, marginTop: 12 }}>{state.success}</p>}
    </form>
  );
}
