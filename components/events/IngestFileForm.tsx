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
      <p className="mono" style={{ fontSize: 10, color: "#6B6B66", marginTop: 6 }}>
        Images: PNG, JPEG, WebP, GIF. Spreadsheets: CSV only for now — one row per event. Copy{" "}
        <a href="https://docs.google.com/spreadsheets/d/1wKeGfS2rHbIFI6lDm_04WohVOGi7wkGd75zZhPMqZmM/edit?gid=845339520#gid=845339520" target="_blank" rel="noreferrer" style={{ color: "#111111", borderBottom: "1px solid #111111" }}>
          this template
        </a>{" "}
        (File → Download → CSV) to get the expected columns.
      </p>

      <label className="mono" style={{ fontSize: 10.5, color: "#6B6B66", display: "block", margin: "16px 0 6px" }}>
        ORGANISER URL (OPTIONAL)
      </label>
      <input
        type="url"
        name="organiser_url"
        placeholder="https://…"
        style={{ width: "100%", background: "#FFFFFF", border: "1px solid #D8D6D0", color: "#111111", padding: "10px 12px", fontSize: 13.5 }}
      />
      <p className="mono" style={{ fontSize: 10, color: "#6B6B66", marginTop: 6 }}>
        Posters rarely show a website — applied to any extracted event that doesn&apos;t already have one.
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
