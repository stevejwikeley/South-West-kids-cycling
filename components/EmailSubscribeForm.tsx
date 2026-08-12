"use client";

import { useActionState, useEffect } from "react";
import { subscribeEmail, type SubscribeEmailState } from "@/lib/actions/subscribe-email";
import { trackEvent } from "@/lib/analytics";

const input: React.CSSProperties = { background: "#FFFFFF", border: "1px solid #D8D6D0", color: "#111111", padding: "10px 12px", fontSize: 13.5, flex: 1, minWidth: 0 };

export default function EmailSubscribeForm() {
  const [state, formAction, pending] = useActionState<SubscribeEmailState, FormData>(subscribeEmail, {});

  useEffect(() => {
    if (state.success) trackEvent("email_subscribe");
  }, [state.success]);

  if (state.success) {
    return (
      <p style={{ fontSize: 14, lineHeight: 1.6, color: "#4A4A46" }}>
        You&apos;re subscribed — the next digest lands at the start of next month.
      </p>
    );
  }

  return (
    <form action={formAction} style={{ maxWidth: 420 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input style={input} type="email" name="email" placeholder="you@example.com" required />
        <button
          type="submit"
          disabled={pending}
          style={{ background: "#111111", color: "#FAFAF8", border: "none", padding: "10px 20px", fontWeight: 700, fontSize: 13.5, cursor: pending ? "default" : "pointer", opacity: pending ? 0.6 : 1 }}
        >
          {pending ? "Subscribing…" : "Subscribe"}
        </button>
      </div>
      {state.error && <p style={{ color: "#A13A2A", fontSize: 12.5, marginTop: 10 }}>{state.error}</p>}
    </form>
  );
}
