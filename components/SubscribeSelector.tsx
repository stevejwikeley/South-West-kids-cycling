"use client";

import { useMemo, useState } from "react";
import CopyLink from "./CopyLink";
import { trackEvent } from "@/lib/analytics";
import { EVENT_DISCIPLINES } from "@/lib/mock-data";
import type { Club, DisciplineId, Region } from "@/lib/types";

// Always production, whatever this page is running on — a feed URL is copied
// into someone's calendar app and stays there for years, so it must never be
// a preview or localhost origin. Same reasoning as the embed builder.
const SITE_URL = "https://www.southwestkidscycling.uk";

type Platform = "google" | "apple" | "outlook";

const PLATFORMS: { id: Platform; label: string; sub: string }[] = [
  { id: "google", label: "Google Calendar", sub: "Gmail, Android" },
  { id: "apple", label: "Apple Calendar", sub: "Mac, iPhone, iPad" },
  { id: "outlook", label: "Outlook / other", sub: "Outlook.com, Office 365, other apps" },
];

const REGION_OPTIONS: [Region | "all", string][] = [
  ["all", "All"],
  ["devon", "Devon"],
  ["cornwall", "Cornwall"],
  ["somerset", "Somerset"],
];

const stepStyle: React.CSSProperties = { fontSize: 14, lineHeight: 1.6, color: "#4A4A46", marginBottom: 10 };
const stepNumStyle: React.CSSProperties = { fontWeight: 700, color: "#111111" };
const subheadStyle: React.CSSProperties = { fontWeight: 700, fontSize: 14.5, marginBottom: 10, marginTop: 24 };
const labelStyle: React.CSSProperties = { fontSize: 10.5, color: "#6B6B66", display: "block", marginBottom: 8, letterSpacing: "0.03em" };

function Callout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: "#FDF3E4", border: "1px solid #E9C98A", padding: "12px 14px", fontSize: 13, lineHeight: 1.6, color: "#6B4E12", marginTop: 14 }}>
      {children}
    </div>
  );
}

export default function SubscribeSelector({
  clubs = [],
  initialDisciplines = [],
  initialRegion = "all",
  initialClub = "all",
}: {
  clubs?: Club[];
  initialDisciplines?: DisciplineId[];
  initialRegion?: Region | "all";
  initialClub?: string;
}) {
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [disciplines, setDisciplines] = useState<Set<DisciplineId>>(new Set(initialDisciplines));
  const [region, setRegion] = useState<Region | "all">(initialRegion);
  const [club, setClub] = useState(initialClub);

  function toggleDiscipline(id: DisciplineId) {
    setDisciplines((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      trackEvent("subscribe_filter_discipline", { discipline: id, active: next.has(id) });
      return next;
    });
  }

  const feedUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (disciplines.size > 0) params.set("discipline", [...disciplines].join(","));
    if (region !== "all") params.set("region", region);
    if (club !== "all") params.set("club", club);
    const query = params.toString();
    return `${SITE_URL}/calendar.ics${query ? `?${query}` : ""}`;
  }, [disciplines, region, club]);

  const isFiltered = disciplines.size > 0 || region !== "all" || club !== "all";

  // Plain-English echo of the filters, so it's obvious what you're about to
  // put in your calendar without decoding the query string.
  const summary = useMemo(() => {
    const discPart =
      disciplines.size > 0
        ? [...disciplines].map((id) => EVENT_DISCIPLINES.find((d) => d.id === id)?.label ?? id).join(", ")
        : "All";
    const clubName = club !== "all" ? clubs.find((c) => c.id === club)?.name : null;
    const regionPart = region !== "all" ? REGION_OPTIONS.find(([v]) => v === region)?.[1] : null;
    return [
      `${discPart} events`,
      clubName ? `from ${clubName}` : null,
      regionPart ? `in ${regionPart}` : null,
    ]
      .filter(Boolean)
      .join(" ");
  }, [disciplines, region, club, clubs]);

  function reset() {
    setDisciplines(new Set());
    setRegion("all");
    setClub("all");
    trackEvent("subscribe_filter_reset", {});
  }

  return (
    <div>
      <p className="mono" style={{ fontSize: 11, letterSpacing: "0.08em", color: "#6B6B66", marginBottom: 6 }}>
        WHAT DO YOU WANT IN YOUR CALENDAR?
      </p>
      <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "#6B6B66", marginBottom: 20, maxWidth: 480 }}>
        Leave everything as it is for the full calendar, or narrow it down — pick a club, a discipline, a county, or any combination. Your subscription updates itself either way.
      </p>

      <div style={{ marginBottom: 22 }}>
        <label className="mono" style={labelStyle}>DISCIPLINE</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {EVENT_DISCIPLINES.map((d) => {
            const active = disciplines.has(d.id);
            return (
              <button
                key={d.id}
                type="button"
                aria-pressed={active}
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

      <div style={{ marginBottom: 22 }}>
        <label className="mono" style={labelStyle}>COUNTY</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {REGION_OPTIONS.map(([val, label]) => (
            <button
              key={val}
              type="button"
              aria-pressed={region === val}
              onClick={() => { setRegion(val); trackEvent("subscribe_filter_region", { region: val }); }}
              className="mono"
              style={{ padding: "8px 15px", fontSize: 11, fontWeight: 700, letterSpacing: "0.03em", background: region === val ? "#111111" : "transparent", color: region === val ? "#FAFAF8" : "#6B6B66", border: "1px solid #D8D6D0", cursor: "pointer" }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {clubs.length > 0 && (
        <div style={{ marginBottom: 22 }}>
          <label className="mono" style={labelStyle} htmlFor="subscribe-club">CLUB</label>
          <select
            id="subscribe-club"
            value={club}
            onChange={(e) => { setClub(e.target.value); trackEvent("subscribe_filter_club", { club_id: e.target.value }); }}
            style={{ width: "100%", maxWidth: 360, background: "#FFFFFF", border: "1px solid #D8D6D0", color: "#111111", padding: "9px 11px", fontSize: 13.5 }}
          >
            <option value="all">All clubs</option>
            {clubs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "12px 14px", background: "#F3F2EE", border: "1px solid #E4E2DD", marginBottom: 32 }}>
        <span style={{ fontSize: 13.5, color: "#4A4A46" }}>
          You&apos;ll get: <strong style={{ color: "#111111" }}>{summary}</strong>
        </span>
        {isFiltered && (
          <button
            type="button"
            onClick={reset}
            className="mono"
            style={{ marginLeft: "auto", background: "none", border: "1px solid #D8D6D0", padding: "5px 10px", fontSize: 10.5, fontWeight: 700, color: "#6B6B66", cursor: "pointer" }}
          >
            RESET
          </button>
        )}
      </div>

      <p className="mono" style={{ fontSize: 11, letterSpacing: "0.08em", color: "#6B6B66", marginBottom: 12 }}>
        WHICH CALENDAR DO YOU USE?
      </p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 28 }}>
        {PLATFORMS.map((p) => {
          const active = platform === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => { setPlatform(p.id); trackEvent("subscribe_platform_select", { platform: p.id }); }}
              style={{
                textAlign: "left",
                padding: "14px 18px",
                background: active ? "#111111" : "#FFFFFF",
                color: active ? "#FAFAF8" : "#111111",
                border: `1px solid ${active ? "#111111" : "#D8D6D0"}`,
                cursor: "pointer",
                minWidth: 160,
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 15 }}>{p.label}</div>
              <div className="mono" style={{ fontSize: 10.5, color: active ? "#D8D6D0" : "#6B6B66", marginTop: 3 }}>{p.sub}</div>
            </button>
          );
        })}
      </div>

      {platform === "google" && (
        <div>
          <p style={stepStyle}><span style={stepNumStyle}>1.</span> Copy this link:</p>
          <CopyLink url={feedUrl} />
          <p style={{ ...stepStyle, marginTop: 18 }}><span style={stepNumStyle}>2.</span> On a computer, open <a href="https://calendar.google.com" target="_blank" rel="noreferrer" style={{ borderBottom: "1px solid #111111" }}>calendar.google.com</a> — this step needs a desktop browser, not the phone app.</p>
          <p style={stepStyle}><span style={stepNumStyle}>3.</span> On the left, next to &ldquo;Other calendars&rdquo;, click <strong>+</strong> → <strong>From URL</strong>.</p>
          <p style={stepStyle}><span style={stepNumStyle}>4.</span> Paste the link and click <strong>Add calendar</strong>.</p>
          <p style={stepStyle}><span style={stepNumStyle}>5.</span> It&apos;ll appear on your phone too once it syncs — Google checks for updates roughly once a day.</p>
          <Callout>
            <strong>Don&apos;t use &ldquo;Import&rdquo;</strong> — that adds a one-off snapshot that won&apos;t update. Use <strong>Other calendars → From URL</strong> instead, so it keeps itself current.
          </Callout>
        </div>
      )}

      {platform === "apple" && (
        <div>
          <div style={subheadStyle}>On a Mac</div>
          <p style={stepStyle}>Two ways to do this — pick based on whether you want it to stay up to date:</p>
          <p style={{ ...stepStyle, fontWeight: 700 }}>Quick, one-off (won&apos;t update)</p>
          <p style={stepStyle}>
            <a
              href={feedUrl}
              style={{ display: "inline-block", background: "#111111", color: "#FAFAF8", padding: "9px 18px", fontWeight: 700, fontSize: 13, textDecoration: "none" }}
            >
              Open in Calendar
            </a>
            {" "}— downloads today&apos;s events into Calendar as a one-time import. New events and booking links added later won&apos;t show up.
          </p>
          <p style={{ ...stepStyle, fontWeight: 700, marginTop: 18 }}>Recommended — stays up to date automatically</p>
          <p style={stepStyle}><span style={stepNumStyle}>1.</span> Copy this link:</p>
          <CopyLink url={feedUrl} />
          <p style={{ ...stepStyle, marginTop: 14 }}><span style={stepNumStyle}>2.</span> Open the <strong>Calendar</strong> app → menu bar → <strong>File → New Calendar Subscription…</strong></p>
          <p style={stepStyle}><span style={stepNumStyle}>3.</span> Paste the link and click <strong>Subscribe</strong>.</p>
          <p style={stepStyle}><span style={stepNumStyle}>4.</span> In the dialog that appears, set <strong>Auto-refresh</strong> to &ldquo;Every day&rdquo;, then click <strong>OK</strong>.</p>

          <div style={subheadStyle}>On iPhone / iPad</div>
          <p style={stepStyle}><span style={stepNumStyle}>1.</span> Copy this link:</p>
          <CopyLink url={feedUrl} />
          <p style={{ ...stepStyle, marginTop: 14 }}><span style={stepNumStyle}>2.</span> Open <strong>Settings → Calendar → Accounts → Add Account → Other → Add Subscribed Calendar</strong>.</p>
          <p style={stepStyle}><span style={stepNumStyle}>3.</span> Paste the link into the &ldquo;Server&rdquo; field, then tap <strong>Next</strong> → <strong>Save</strong>.</p>
          <p style={{ fontSize: 12, color: "#6B6B66" }}>The exact menu wording moves around slightly between iOS versions — look for &ldquo;Add Subscribed Calendar&rdquo; under Calendar accounts if this doesn&apos;t match exactly.</p>
        </div>
      )}

      {platform === "outlook" && (
        <div>
          <p style={stepStyle}><span style={stepNumStyle}>1.</span> Copy this link:</p>
          <CopyLink url={feedUrl} />
          <p style={{ ...stepStyle, marginTop: 18 }}><span style={stepNumStyle}>2.</span> In your calendar app, look for an option along the lines of <strong>&ldquo;Subscribe from web&rdquo;</strong>, <strong>&ldquo;Add calendar from URL&rdquo;</strong>, or <strong>&ldquo;Add by link&rdquo;</strong> — the exact wording depends on the app.</p>
          <p style={stepStyle}><span style={stepNumStyle}>3.</span> Paste the link and confirm.</p>
          <p style={{ ...stepStyle, marginTop: 14 }}>For Outlook.com specifically: <strong>Add calendar → Subscribe from web</strong>, paste the link, then <strong>Import</strong>.</p>
        </div>
      )}

      {isFiltered && (
        <p style={{ fontSize: 12.5, color: "#6B6B66", marginTop: 24, lineHeight: 1.6, maxWidth: 520 }}>
          Changing the filters above changes the link — if you&apos;ve already subscribed and want something different, copy the new link and add it as a second calendar (or remove the old one first).
        </p>
      )}
    </div>
  );
}
