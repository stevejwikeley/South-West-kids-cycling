"use client";

import { useActionState, useEffect, useRef } from "react";
import { addWatchedSource, type SourceActionResult } from "@/lib/actions/sources";

export default function WatchedSourceForm() {
  const [state, formAction, pending] = useActionState<SourceActionResult, FormData>(addWatchedSource, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state.success]);

  return (
    <form ref={formRef} action={formAction} style={{ maxWidth: 420 }}>
      <label className="mono" style={{ fontSize: 10.5, color: "#6B6B66", display: "block", marginBottom: 6 }}>
        LABEL
      </label>
      <input
        name="label"
        required
        placeholder="e.g. Sportiva Kids Triathlon"
        style={{ width: "100%", background: "#FFFFFF", border: "1px solid #D8D6D0", color: "#111111", padding: "9px 12px", fontSize: 13.5 }}
      />

      <label className="mono" style={{ fontSize: 10.5, color: "#6B6B66", display: "block", margin: "14px 0 6px" }}>
        URL
      </label>
      <input
        name="url"
        type="url"
        required
        placeholder="https://…"
        style={{ width: "100%", background: "#FFFFFF", border: "1px solid #D8D6D0", color: "#111111", padding: "9px 12px", fontSize: 13.5 }}
      />

      <label className="mono" style={{ fontSize: 10.5, color: "#6B6B66", display: "block", margin: "14px 0 6px" }}>
        CHECK FREQUENCY
      </label>
      <select
        name="check_frequency"
        defaultValue="nightly"
        style={{ width: "100%", background: "#FFFFFF", border: "1px solid #D8D6D0", color: "#111111", padding: "9px 12px", fontSize: 13.5 }}
      >
        <option value="nightly">Nightly</option>
        <option value="weekly">Weekly</option>
      </select>

      <button
        type="submit"
        disabled={pending}
        style={{ marginTop: 16, background: "#111111", color: "#FAFAF8", border: "none", padding: "11px 20px", fontWeight: 700, fontSize: 13, cursor: pending ? "default" : "pointer", opacity: pending ? 0.6 : 1 }}
      >
        {pending ? "Adding…" : "Add source"}
      </button>
      {state.error && <p style={{ color: "#A13A2A", fontSize: 12.5, marginTop: 12 }}>{state.error}</p>}
      {state.success && <p style={{ color: "#1F5D3A", fontSize: 12.5, marginTop: 12 }}>{state.success}</p>}
    </form>
  );
}
