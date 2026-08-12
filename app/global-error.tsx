"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body style={{ fontFamily: "-apple-system, sans-serif", background: "#FAFAF8", color: "#111111", display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center" }}>
        <div style={{ maxWidth: 420, padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 22, marginBottom: 12 }}>Something went wrong.</h1>
          <p style={{ fontSize: 14, color: "#6B6B66", marginBottom: 20 }}>
            We&apos;ve been notified and will take a look. Try reloading the page.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{ background: "#111111", color: "#FAFAF8", border: "none", padding: "10px 20px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
