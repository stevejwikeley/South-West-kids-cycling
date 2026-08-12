"use client";

import { useActionState } from "react";
import { unsubscribeByToken, type UnsubscribeState } from "@/lib/actions/subscribe-email";

export default function UnsubscribeButton({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState<UnsubscribeState, FormData>(
    (_prevState, formData) => unsubscribeByToken(String(formData.get("token"))),
    {}
  );

  if (state.success) {
    return <p style={{ fontSize: 15, lineHeight: 1.6, color: "#4A4A46" }}>You&apos;ve been unsubscribed — you won&apos;t get any more emails from us.</p>;
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="token" value={token} />
      <button
        type="submit"
        disabled={pending}
        style={{ background: "#111111", color: "#FAFAF8", border: "none", padding: "12px 24px", fontWeight: 700, fontSize: 13.5, cursor: pending ? "default" : "pointer", opacity: pending ? 0.6 : 1 }}
      >
        {pending ? "Unsubscribing…" : "Unsubscribe"}
      </button>
      {state.error && <p style={{ color: "#A13A2A", fontSize: 12.5, marginTop: 14 }}>{state.error}</p>}
    </form>
  );
}
