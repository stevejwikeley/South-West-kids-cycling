"use client";

import { useActionState } from "react";
import { ingestTextOrUrl, type IngestState } from "@/lib/actions/ingest";

export default function IngestTextForm({ initialInput, initialSourceUrl }: { initialInput?: string; initialSourceUrl?: string }) {
  const [state, formAction, pending] = useActionState<IngestState, FormData>(ingestTextOrUrl, {});

  return (
    <form action={formAction} style={{ maxWidth: 480 }}>
      <label className="mono" style={{ fontSize: 10.5, color: "#6B6B66", display: "block", marginBottom: 6 }}>
        URL OR PASTED TEXT
      </label>
      <textarea
        name="input"
        required
        defaultValue={initialInput}
        placeholder="Paste a British Cycling listing URL, a club page URL, or pasted event text/Facebook post…"
        style={{ width: "100%", minHeight: 120, background: "#FFFFFF", border: "1px solid #D8D6D0", color: "#111111", padding: "10px 12px", fontSize: 13.5, resize: "vertical" }}
      />

      <label className="mono" style={{ fontSize: 10.5, color: "#6B6B66", display: "block", margin: "14px 0 6px" }}>
        SOURCE URL (OPTIONAL — ONLY NEEDED WHEN PASTING TEXT, NOT A URL ABOVE)
      </label>
      <input
        type="url"
        name="source_url"
        defaultValue={initialSourceUrl}
        placeholder="https://… — the page this text came from"
        style={{ width: "100%", background: "#FFFFFF", border: "1px solid #D8D6D0", color: "#111111", padding: "9px 12px", fontSize: 13.5 }}
      />
      <p className="mono" style={{ fontSize: 10, color: "#9A9992", marginTop: 6 }}>
        Used as the fallback organiser link for anything extracted that doesn&apos;t already have one — filled in automatically by the bookmarklet below.
      </p>

      <button
        type="submit"
        disabled={pending}
        style={{ marginTop: 14, background: "#111111", color: "#FAFAF8", border: "none", padding: "11px 20px", fontWeight: 700, fontSize: 13, cursor: pending ? "default" : "pointer", opacity: pending ? 0.6 : 1 }}
      >
        {pending ? "Extracting…" : "Extract events"}
      </button>
      {state.error && <p style={{ color: "#A13A2A", fontSize: 12.5, marginTop: 12 }}>{state.error}</p>}
      {state.success && <p style={{ color: "#1F5D3A", fontSize: 12.5, marginTop: 12 }}>{state.success}</p>}
    </form>
  );
}
