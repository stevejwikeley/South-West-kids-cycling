"use client";

import { useActionState } from "react";
import { ingestFile, type IngestState } from "@/lib/actions/ingest";

export default function IngestFileForm() {
  const [state, formAction, pending] = useActionState<IngestState, FormData>(ingestFile, {});

  return (
    <form action={formAction} style={{ maxWidth: 480 }}>
      <label className="mono" style={{ fontSize: 10.5, color: "#6B6B66", display: "block", marginBottom: 6 }}>
        POSTER/FLYER IMAGE OR CSV SPREADSHEET
      </label>
      <input
        type="file"
        name="file"
        required
        accept="image/png,image/jpeg,image/webp,image/gif,.csv,text/csv,text/plain"
        style={{ width: "100%", background: "#FFFFFF", border: "1px solid #D8D6D0", color: "#111111", padding: "10px 12px", fontSize: 13.5 }}
      />
      <p className="mono" style={{ fontSize: 10, color: "#9A9992", marginTop: 6 }}>
        Images: PNG, JPEG, WebP, GIF. Spreadsheets: CSV only for now — one row per event.
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
