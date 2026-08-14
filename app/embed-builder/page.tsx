"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { EVENT_DISCIPLINES } from "@/lib/mock-data";
import type { DisciplineId, Region } from "@/lib/types";

// Always points at production regardless of which environment this builder
// itself is running on (preview, localhost) — a club pasting this snippet
// onto their own site should never end up embedding a staging URL.
const SITE_URL = "https://www.southwestkidscycling.uk";

const REGION_OPTIONS: [Region | "all", string][] = [
  ["all", "All"],
  ["devon", "Devon"],
  ["cornwall", "Cornwall"],
];

export default function EmbedBuilderPage() {
  const [region, setRegion] = useState<Region | "all">("all");
  const [disciplines, setDisciplines] = useState<Set<DisciplineId>>(new Set());
  const [limit, setLimit] = useState(15);
  const [copied, setCopied] = useState(false);

  function toggleDiscipline(id: DisciplineId) {
    setDisciplines((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const src = useMemo(() => {
    const params = new URLSearchParams();
    if (region !== "all") params.set("region", region);
    if (disciplines.size > 0) params.set("discipline", [...disciplines].join(","));
    if (limit !== 15) params.set("limit", String(limit));
    const query = params.toString();
    return `${SITE_URL}/embed${query ? `?${query}` : ""}`;
  }, [region, disciplines, limit]);

  const snippet = `<iframe src="${src}" style="width:100%;max-width:640px;height:600px;border:0;" title="South West Kids Cycling events"></iframe>`;

  async function copy() {
    await navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <header style={{ maxWidth: 1100, margin: "0 auto", padding: "56px 24px 120px" }}>
      <div className="mono" style={{ fontSize: 11.5, letterSpacing: "0.12em", color: "#E0102A", marginBottom: 16, fontWeight: 700 }}>FOR CLUB WEBSITES</div>
      <h1 className="disp" style={{ fontSize: "clamp(28px, 4.5vw, 44px)", lineHeight: 1.05, margin: 0, marginBottom: 20, letterSpacing: "-0.01em" }}>
        Embed builder.
      </h1>
      <p style={{ maxWidth: 560, fontSize: 14, lineHeight: 1.6, color: "#4A4A46", marginBottom: 40 }}>
        Give your club&apos;s own website a live events widget — pick what to show, then copy the code below into any page that accepts HTML.
      </p>

      <div style={{ display: "flex", gap: 48, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 320px", maxWidth: 400 }}>
          <div style={{ marginBottom: 24 }}>
            <label className="mono" style={{ fontSize: 10.5, color: "#6B6B66", display: "block", marginBottom: 8, letterSpacing: "0.03em" }}>REGION</label>
            <div style={{ display: "flex", gap: 8 }}>
              {REGION_OPTIONS.map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setRegion(val)}
                  className="mono"
                  style={{ padding: "8px 15px", fontSize: 11, fontWeight: 700, letterSpacing: "0.03em", background: region === val ? "#111111" : "transparent", color: region === val ? "#FAFAF8" : "#6B6B66", border: "1px solid #D8D6D0", cursor: "pointer" }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 24 }}>
            <label className="mono" style={{ fontSize: 10.5, color: "#6B6B66", display: "block", marginBottom: 8, letterSpacing: "0.03em" }}>DISCIPLINE (LEAVE BLANK FOR ALL)</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {EVENT_DISCIPLINES.map((d) => {
                const active = disciplines.has(d.id);
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => toggleDiscipline(d.id)}
                    style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 13px", borderRadius: 999, border: `1px solid ${active ? d.color : "#D8D6D0"}`, background: active ? d.color : "transparent", color: active ? "#FAFAF8" : "#4A4A46", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                  >
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: active ? "#FAFAF8" : d.color }} />
                    {d.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ marginBottom: 32 }}>
            <label className="mono" style={{ fontSize: 10.5, color: "#6B6B66", display: "block", marginBottom: 8, letterSpacing: "0.03em" }}>MAX EVENTS SHOWN</label>
            <input
              type="number"
              min={1}
              max={50}
              value={limit}
              onChange={(e) => setLimit(Math.max(1, Math.min(50, Number(e.target.value) || 15)))}
              style={{ width: 100, background: "#FFFFFF", border: "1px solid #D8D6D0", color: "#111111", padding: "9px 11px", fontSize: 13.5 }}
            />
          </div>

          <label className="mono" style={{ fontSize: 10.5, color: "#6B6B66", display: "block", marginBottom: 8, letterSpacing: "0.03em" }}>EMBED CODE</label>
          <pre style={{ background: "#F3F2EE", border: "1px solid #D8D6D0", padding: "10px 12px", fontSize: 11.5, overflowX: "auto", marginBottom: 10, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
            {snippet}
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

        <div style={{ flex: "1 1 380px", minWidth: 320 }}>
          <label className="mono" style={{ fontSize: 10.5, color: "#6B6B66", display: "block", marginBottom: 8, letterSpacing: "0.03em" }}>LIVE PREVIEW</label>
          <div style={{ border: "1px solid #D8D6D0", background: "#FAFAF8" }}>
            <iframe src={src} style={{ width: "100%", height: 600, border: 0, display: "block" }} title="Embed preview" />
          </div>
        </div>
      </div>

      <div style={{ marginTop: 56, padding: "24px 28px", background: "#111111", color: "#FAFAF8", maxWidth: 560 }}>
        <h2 className="disp" style={{ fontSize: 18, margin: 0, marginBottom: 10 }}>Want these on your own calendar too?</h2>
        <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "#D8D6D0", marginBottom: 16 }}>
          Embedding is great for your visitors — but for yourself, it&apos;s better to be in your calendar than checking a website. Subscribe once by email or calendar feed and every new event lands automatically.
        </p>
        <Link href="/subscribe" style={{ display: "inline-block", background: "#FAFAF8", color: "#111111", padding: "10px 20px", fontWeight: 700, fontSize: 13 }}>
          Subscribe →
        </Link>
      </div>
    </header>
  );
}
