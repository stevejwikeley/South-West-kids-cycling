"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const searchParams = useSearchParams();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("sending");
    setErrorMessage("");

    const supabase = createClient();
    const next = searchParams.get("next") ?? "/admin";
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/confirm?next=${encodeURIComponent(next)}`,
      },
    });

    if (error) {
      setStatus("error");
      setErrorMessage(error.message);
    } else {
      setStatus("sent");
    }
  };

  return (
    <header style={{ maxWidth: 1100, margin: "0 auto", padding: "80px 24px 120px" }}>
      <div className="mono" style={{ fontSize: 11.5, letterSpacing: "0.12em", color: "#E0102A", marginBottom: 16, fontWeight: 700 }}>ADMIN &amp; ORGANISER SIGN IN</div>
      <h1 className="disp" style={{ fontSize: "clamp(32px, 5.2vw, 52px)", lineHeight: 1.02, margin: 0, letterSpacing: "-0.01em" }}>
        Sign in.
      </h1>

      {status === "sent" ? (
        <p style={{ maxWidth: 420, fontSize: 15, lineHeight: 1.6, color: "#4A4A46", marginTop: 22 }}>
          Check <strong>{email}</strong> for a sign-in link. It&apos;ll log you straight in — no password needed.
        </p>
      ) : (
        <form onSubmit={handleSubmit} style={{ maxWidth: 360, marginTop: 28 }}>
          <label className="mono" style={{ fontSize: 10.5, color: "#6B6B66", display: "block", marginBottom: 6 }}>EMAIL</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            style={{ width: "100%", background: "#FFFFFF", border: "1px solid #D8D6D0", color: "#111111", padding: "10px 12px", fontSize: 14, marginBottom: 14 }}
          />
          <button
            type="submit"
            disabled={status === "sending"}
            style={{ background: "#111111", color: "#FAFAF8", border: "none", padding: "12px 22px", fontWeight: 700, fontSize: 13.5, cursor: status === "sending" ? "default" : "pointer", opacity: status === "sending" ? 0.6 : 1 }}
          >
            {status === "sending" ? "Sending…" : "Send sign-in link"}
          </button>
          {status === "error" && (
            <p style={{ color: "#A13A2A", fontSize: 12.5, marginTop: 12 }}>{errorMessage}</p>
          )}
        </form>
      )}
    </header>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
