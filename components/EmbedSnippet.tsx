"use client";

import { useState } from "react";

const SNIPPET = `<iframe src="https://www.southwestkidscycling.uk/embed" style="width:100%;max-width:640px;height:600px;border:0;" title="South West Kids Cycling events"></iframe>`;

export default function EmbedSnippet() {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(SNIPPET);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div style={{ marginTop: 40, maxWidth: 640, padding: "16px 18px", background: "#F3F2EE", border: "1px solid #E4E2DD" }}>
      <h3 className="mono" style={{ fontSize: 11, letterSpacing: "0.08em", color: "#6B6B66", marginBottom: 8 }}>
        EMBED THIS CALENDAR ON YOUR CLUB SITE
      </h3>
      <p style={{ fontSize: 13, lineHeight: 1.6, color: "#4A4A46", marginBottom: 12 }}>
        Give your members the full Devon &amp; Cornwall youth calendar without leaving your own site — paste this into any page that accepts HTML. Add <code>?region=devon</code>, <code>?region=cornwall</code>, or <code>?discipline=cx,xc</code> to the src URL to narrow it down.
      </p>
      <pre style={{ background: "#FFFFFF", border: "1px solid #D8D6D0", padding: "10px 12px", fontSize: 11.5, overflowX: "auto", marginBottom: 10, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
        {SNIPPET}
      </pre>
      <button
        type="button"
        onClick={copy}
        className="mono"
        style={{ background: "#111111", color: "#FAFAF8", border: "none", padding: "9px 16px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}
      >
        {copied ? "Copied!" : "Copy snippet"}
      </button>
    </div>
  );
}
