"use client";

import { useMemo, useState } from "react";
import type { Club, Discipline, DisciplineId, Region } from "@/lib/types";

// Always points at production regardless of which environment this builder
// itself is running on (preview, localhost) — a club pasting this snippet
// onto their own site should never end up embedding a staging URL.
const SITE_URL = "https://www.southwestkidscycling.uk";

const REGION_OPTIONS: [Region | "all", string][] = [
  ["all", "All"],
  ["devon", "Devon"],
  ["cornwall", "Cornwall"],
  ["somerset", "Somerset"],
  ["bristol", "Bristol"],
];

export default function EmbedBuilderPage({
  clubs,
  disciplines: availableDisciplines,
}: {
  clubs: Club[];
  // The chips to render — the full curated discipline list (see
  // app/embed-builder/page.tsx and lib/subscribable-disciplines.ts), plus
  // any discipline genuinely present in the data that isn't in that curated
  // list yet. Deliberately NOT limited to disciplines with a live upcoming
  // event, unlike the calendar's own filter chips (lib/visible-
  // disciplines.ts) — this builder produces an embed snippet a club pastes
  // into their own site and keeps indefinitely, so a discipline with nothing
  // scheduled this week must still be offerable (see the comment in
  // app/subscribe/page.tsx for the regression this avoids). Already excludes
  // "training": that isn't a discipline here either — it is per-club, and
  // has its own toggle below (SESSIONS), same as the subscribe builder — a
  // deliberate policy choice, not an oversight.
  disciplines: Discipline[];
}) {
  const [region, setRegion] = useState<Region | "all">("all");
  const [disciplines, setDisciplines] = useState<Set<DisciplineId>>(new Set());
  const [club, setClub] = useState("all");
  const [limit, setLimit] = useState(15);
  const [sessionsMode, setSessionsMode] = useState<"races" | "training">("races");
  const [includeTraining, setIncludeTraining] = useState(false);
  const [copied, setCopied] = useState(false);

  function toggleDiscipline(id: DisciplineId) {
    setDisciplines((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
    // A selection made here is kept even while Club training is selected
    // (chips are just disabled, not cleared) so switching back to Races &
    // events restores it.
  }

  // A segmented Races & events / Club training control, mapped onto the
  // single ?kind= the /embed route understands. Exactly one of the two is
  // always selected, so — unlike the old pair of independent toggles — there
  // is no "both off" state to special-case here.
  const kind: "race" | "training" | "all" =
    sessionsMode === "training" ? "training" : includeTraining ? "all" : "race";

  const src = useMemo(() => {
    const params = new URLSearchParams();
    if (region !== "all") params.set("region", region);
    // Club training carries no discipline of its own, so chips never apply
    // there even if some are selected from a previous Races & events visit.
    // Otherwise: training rows carry discipline "training" — if chips are
    // narrowing the discipline list and training is included (kind=all),
    // "training" has to be added too, or the training half of the widget
    // shows nothing.
    const disciplineList = sessionsMode === "training" ? [] : [...disciplines];
    if (sessionsMode === "races" && includeTraining && disciplineList.length > 0) disciplineList.push("training");
    if (disciplineList.length > 0) params.set("discipline", disciplineList.join(","));
    if (club !== "all") params.set("club", club);
    if (limit !== 15) params.set("limit", String(limit));
    if (kind !== "race") params.set("kind", kind);
    const query = params.toString();
    return `${SITE_URL}/embed${query ? `?${query}` : ""}`;
  }, [region, disciplines, club, limit, kind, sessionsMode, includeTraining]);

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
              {availableDisciplines.map((d) => {
                const active = disciplines.has(d.id);
                const disabled = sessionsMode === "training";
                return (
                  <button
                    key={d.id}
                    type="button"
                    disabled={disabled}
                    aria-disabled={disabled}
                    onClick={() => toggleDiscipline(d.id)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "6px 13px",
                      borderRadius: 999,
                      border: `1px solid ${disabled ? "#E4E2DD" : active ? d.color : "#D8D6D0"}`,
                      background: disabled ? "#F3F2EE" : active ? d.color : "transparent",
                      color: disabled ? "#B7B5AF" : active ? "#FAFAF8" : "#4A4A46",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: disabled ? "not-allowed" : "pointer",
                    }}
                  >
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: disabled ? "#CFCDC7" : active ? "#FAFAF8" : d.color }} />
                    {d.label}
                  </button>
                );
              })}
            </div>
            {sessionsMode === "training" && (
              <p style={{ fontSize: 12, color: "#6B6B66", marginTop: 8 }}>
                Training sessions aren&apos;t split by discipline.
              </p>
            )}
          </div>

          {clubs.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <label className="mono" style={{ fontSize: 10.5, color: "#6B6B66", display: "block", marginBottom: 8, letterSpacing: "0.03em" }}>CLUB (LEAVE BLANK FOR ALL)</label>
              <select
                value={club}
                onChange={(e) => setClub(e.target.value)}
                style={{ width: "100%", background: "#FFFFFF", border: "1px solid #D8D6D0", color: "#111111", padding: "9px 11px", fontSize: 13.5 }}
              >
                <option value="all">All clubs</option>
                {clubs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}

          <div style={{ marginBottom: 24 }}>
            <label className="mono" style={{ fontSize: 10.5, color: "#6B6B66", display: "block", marginBottom: 8, letterSpacing: "0.03em" }}>SESSIONS</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {(["races", "training"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={sessionsMode === mode}
                  onClick={() => setSessionsMode(mode)}
                  className="mono"
                  style={{ padding: "8px 15px", fontSize: 11, fontWeight: 700, letterSpacing: "0.03em", background: sessionsMode === mode ? "#111111" : "transparent", color: sessionsMode === mode ? "#FAFAF8" : "#6B6B66", border: "1px solid #D8D6D0", cursor: "pointer" }}
                >
                  {mode === "races" ? "Races & events" : "Club training"}
                </button>
              ))}
            </div>
            {sessionsMode === "races" && (
              <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: 13, color: "#4A4A46", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={includeTraining}
                  onChange={(e) => setIncludeTraining(e.target.checked)}
                />
                Also include club training sessions
              </label>
            )}
            <p style={{ fontSize: 12, color: "#6B6B66", marginTop: 8, maxWidth: 340 }}>
              Club only narrows Club training, not Races &amp; events — most races aren&apos;t tied to one club the way training is. A club can pick itself above and switch to Club training to show just its own sessions on its own site.
            </p>
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
    </header>
  );
}
