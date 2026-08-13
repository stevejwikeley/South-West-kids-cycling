"use client";

import { useState } from "react";
import CopyLink from "./CopyLink";
import { trackEvent } from "@/lib/analytics";

const CALENDAR_URL = "https://www.southwestkidscycling.uk/calendar.ics";

type Platform = "google" | "apple" | "outlook";

const PLATFORMS: { id: Platform; label: string; sub: string }[] = [
  { id: "google", label: "Google Calendar", sub: "Gmail, Android" },
  { id: "apple", label: "Apple Calendar", sub: "Mac, iPhone, iPad" },
  { id: "outlook", label: "Outlook / other", sub: "Outlook.com, Office 365, other apps" },
];

const stepStyle: React.CSSProperties = { fontSize: 14, lineHeight: 1.6, color: "#4A4A46", marginBottom: 10 };
const stepNumStyle: React.CSSProperties = { fontWeight: 700, color: "#111111" };
const subheadStyle: React.CSSProperties = { fontWeight: 700, fontSize: 14.5, marginBottom: 10, marginTop: 24 };

function Callout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: "#FDF3E4", border: "1px solid #E9C98A", padding: "12px 14px", fontSize: 13, lineHeight: 1.6, color: "#6B4E12", marginTop: 14 }}>
      {children}
    </div>
  );
}

export default function SubscribeSelector() {
  const [platform, setPlatform] = useState<Platform | null>(null);

  return (
    <div>
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
          <CopyLink url={CALENDAR_URL} />
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
              href={CALENDAR_URL}
              style={{ display: "inline-block", background: "#111111", color: "#FAFAF8", padding: "9px 18px", fontWeight: 700, fontSize: 13, textDecoration: "none" }}
            >
              Open in Calendar
            </a>
            {" "}— downloads today&apos;s events into Calendar as a one-time import. New events and booking links added later won&apos;t show up.
          </p>
          <p style={{ ...stepStyle, fontWeight: 700, marginTop: 18 }}>Recommended — stays up to date automatically</p>
          <p style={stepStyle}><span style={stepNumStyle}>1.</span> Copy this link:</p>
          <CopyLink url={CALENDAR_URL} />
          <p style={{ ...stepStyle, marginTop: 14 }}><span style={stepNumStyle}>2.</span> Open the <strong>Calendar</strong> app → menu bar → <strong>File → New Calendar Subscription…</strong></p>
          <p style={stepStyle}><span style={stepNumStyle}>3.</span> Paste the link and click <strong>Subscribe</strong>.</p>
          <p style={stepStyle}><span style={stepNumStyle}>4.</span> In the dialog that appears, set <strong>Auto-refresh</strong> to &ldquo;Every day&rdquo;, then click <strong>OK</strong>.</p>

          <div style={subheadStyle}>On iPhone / iPad</div>
          <p style={stepStyle}><span style={stepNumStyle}>1.</span> Copy this link:</p>
          <CopyLink url={CALENDAR_URL} />
          <p style={{ ...stepStyle, marginTop: 14 }}><span style={stepNumStyle}>2.</span> Open <strong>Settings → Calendar → Accounts → Add Account → Other → Add Subscribed Calendar</strong>.</p>
          <p style={stepStyle}><span style={stepNumStyle}>3.</span> Paste the link into the &ldquo;Server&rdquo; field, then tap <strong>Next</strong> → <strong>Save</strong>.</p>
          <p style={{ fontSize: 12, color: "#6B6B66" }}>The exact menu wording moves around slightly between iOS versions — look for &ldquo;Add Subscribed Calendar&rdquo; under Calendar accounts if this doesn&apos;t match exactly.</p>
        </div>
      )}

      {platform === "outlook" && (
        <div>
          <p style={stepStyle}><span style={stepNumStyle}>1.</span> Copy this link:</p>
          <CopyLink url={CALENDAR_URL} />
          <p style={{ ...stepStyle, marginTop: 18 }}><span style={stepNumStyle}>2.</span> In your calendar app, look for an option along the lines of <strong>&ldquo;Subscribe from web&rdquo;</strong>, <strong>&ldquo;Add calendar from URL&rdquo;</strong>, or <strong>&ldquo;Add by link&rdquo;</strong> — the exact wording depends on the app.</p>
          <p style={stepStyle}><span style={stepNumStyle}>3.</span> Paste the link and confirm.</p>
          <p style={{ ...stepStyle, marginTop: 14 }}>For Outlook.com specifically: <strong>Add calendar → Subscribe from web</strong>, paste the link, then <strong>Import</strong>.</p>
        </div>
      )}
    </div>
  );
}
