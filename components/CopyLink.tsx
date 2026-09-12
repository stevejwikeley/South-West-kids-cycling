"use client";

import { useState } from "react";
import { trackEvent } from "@/lib/analytics";

export default function CopyLink({ url, testId }: { url: string; testId?: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      trackEvent("calendar_link_copy");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable — the URL is still visible in the field
      // for manual select-and-copy, so this isn't a dead end.
    }
  }

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <input
        readOnly
        aria-label="Calendar feed link"
        value={url}
        onClick={(e) => e.currentTarget.select()}
        className="mono"
        style={{ flex: "1 1 260px", background: "#FFFFFF", border: "1px solid #D8D6D0", padding: "9px 11px", fontSize: 12.5, color: "#111111" }}
      />
      {testId && (
        // The input above shows this same text visually, but an <input>'s
        // value isn't part of its textContent, so text-based assertions
        // (e.g. Playwright's toContainText) can't see it there. This mirrors
        // it as a real text node for that purpose without changing what's
        // shown on screen.
        <span data-testid={testId} aria-hidden="true" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" }}>
          {url}
        </span>
      )}
      <button
        type="button"
        onClick={handleCopy}
        className="mono"
        style={{
          fontSize: 11.5,
          fontWeight: 700,
          color: copied ? "#1F5D3A" : "#111111",
          background: copied ? "#EAF3EC" : "none",
          border: `1px solid ${copied ? "#1F5D3A" : "#111111"}`,
          padding: "9px 16px",
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {copied ? "Copied!" : "Copy link"}
      </button>
    </div>
  );
}
