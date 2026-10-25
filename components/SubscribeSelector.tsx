"use client";

import { useMemo, useState } from "react";
import { CalendarCheck, Laptop, Smartphone } from "lucide-react";
import CopyLink from "./CopyLink";
import { trackAddToCalendar, trackEvent } from "@/lib/analytics";
import { fmtDay } from "@/lib/format";
import { eventDisc } from "@/lib/mock-data";
import { CALENDAR_NAME, feedUrlFor, outlookAddUrl, subscribeLinkFor, type Platform } from "@/lib/subscribe-links";
import { useDetectedPlatform } from "./useDetectedPlatform";
import type { Club, Discipline, DisciplineId, Region } from "@/lib/types";

// The decision tree: device first, then the calendar app on that device.
// Each leaf gets exactly one primary action — a link that opens the app's
// own "subscribe to this calendar" flow — so nobody has to pick between
// options they don't understand. The copy-and-paste route is still there,
// folded away, for when the one-tap link doesn't take.
type Device = "phone" | "computer";

const DEVICES: { id: Device; label: string; Icon: typeof Smartphone }[] = [
  { id: "phone", label: "On my phone", Icon: Smartphone },
  { id: "computer", label: "On my computer", Icon: Laptop },
];

const PLATFORMS: Record<Device, { id: Platform; label: string; sub: string }[]> = {
  phone: [
    { id: "iphone", label: "iPhone or iPad", sub: "Apple Calendar" },
    { id: "android", label: "Android", sub: "Google Calendar" },
  ],
  computer: [
    { id: "google", label: "Google Calendar", sub: "Gmail, Android" },
    { id: "mac", label: "Apple Calendar", sub: "Mac" },
    { id: "outlook", label: "Outlook", sub: "Outlook.com, Microsoft 365" },
    { id: "other", label: "Something else", sub: "Any app that takes a link" },
  ],
};

const REGION_OPTIONS: [Region | "all", string][] = [
  ["all", "All"],
  ["devon", "Devon"],
  ["cornwall", "Cornwall"],
  ["somerset", "Somerset"],
];

// Just the fields the "in your calendar" preview draws — the page passes
// these rather than whole CalendarEvents so the client bundle stays small.
export interface PreviewEvent {
  id: string;
  title: string;
  date: string;
  discipline: DisciplineId;
  region: Region;
  venue: string;
}

const PREVIEW_COUNT = 3;

const stepStyle: React.CSSProperties = { fontSize: 14, lineHeight: 1.6, color: "#4A4A46", marginBottom: 10 };
const stepNumStyle: React.CSSProperties = { fontWeight: 700, color: "#111111" };
const labelStyle: React.CSSProperties = { fontSize: 10.5, color: "#6B6B66", display: "block", marginBottom: 8, letterSpacing: "0.03em" };
const questionStyle: React.CSSProperties = { fontSize: 11, letterSpacing: "0.08em", color: "#6B6B66", marginBottom: 12 };
const primaryButtonStyle: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 8, background: "#E0102A", color: "#FAFAF8", padding: "15px 26px", fontWeight: 700, fontSize: 15, textDecoration: "none" };
const disclosureStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", padding: 0, fontSize: 11, fontWeight: 700, letterSpacing: "0.03em", color: "#6B6B66", cursor: "pointer" };

function Callout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: "#FDF3E4", border: "1px solid #E9C98A", padding: "12px 14px", fontSize: 13, lineHeight: 1.6, color: "#6B4E12", marginTop: 14 }}>
      {children}
    </div>
  );
}

function Disclosure({ label, open, onToggle, children }: { label: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <div>
      <button type="button" aria-expanded={open} onClick={onToggle} className="mono" style={disclosureStyle}>
        <span aria-hidden style={{ display: "inline-block", transform: open ? "rotate(90deg)" : "none", transition: "transform 120ms" }}>
          ▸
        </span>
        {label}
      </button>
      {open && <div style={{ marginTop: 14 }}>{children}</div>}
    </div>
  );
}

function ChoiceCard({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      style={{
        textAlign: "left",
        padding: "14px 18px",
        background: active ? "#111111" : "#FFFFFF",
        color: active ? "#FAFAF8" : "#111111",
        border: `1px solid ${active ? "#111111" : "#D8D6D0"}`,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

// Only ever preselects the device from the browser's guess — the calendar
// app is still the visitor's call here (plenty of iPhone owners live in
// Google Calendar). This page is the advanced route; the calendar's own
// button already went with the guess.
const deviceFor = (p: Platform | null): Device | null =>
  p === "iphone" || p === "android" ? "phone" : p ? "computer" : null;

// Mirrors the feed's own filtering (app/calendar.ics/route.ts) closely
// enough to give an honest preview: races only, cancelled dropped, and a
// "both" event counts as Devon and as Cornwall. Training isn't in the
// page's event list at all, so it's described in words instead.
function matchesFeed(e: PreviewEvent, disciplines: Set<DisciplineId>, region: Region | "all") {
  if (disciplines.size > 0 && !disciplines.has(e.discipline)) return false;
  if (region === "all") return true;
  if (e.region === region) return true;
  return e.region === "both" && (region === "devon" || region === "cornwall");
}

export default function SubscribeSelector({
  clubs = [],
  events = [],
  disciplines: availableDisciplines = [],
  initialDisciplines = [],
  initialRegion = "all",
  initialClub = "all",
}: {
  clubs?: Club[];
  // Upcoming, non-cancelled races, for the "in your calendar" preview.
  events?: PreviewEvent[];
  // The chips to render — the full curated discipline list (see
  // app/subscribe/page.tsx and lib/subscribable-disciplines.ts), plus any
  // discipline genuinely present in the data that isn't in that curated list
  // yet. Deliberately NOT limited to disciplines with a live upcoming event
  // — this page builds a standing feed URL that outlives whatever happens to
  // be scheduled this week (see the comment in app/subscribe/page.tsx for
  // the regression this avoids). Already excludes "training", which isn't
  // offered as a chip here (see the Club training control below), so this
  // component doesn't need to filter it again.
  disciplines?: Discipline[];
  initialDisciplines?: DisciplineId[];
  initialRegion?: Region | "all";
  initialClub?: string;
}) {
  const [chosenDevice, setChosenDevice] = useState<Device | null>(null);
  // navigator only exists in the browser, so the server snapshot is null and
  // the guess appears after hydration without a server/client mismatch.
  const guessedDevice = deviceFor(useDetectedPlatform());
  const device = chosenDevice ?? guessedDevice;
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [disciplines, setDisciplines] = useState<Set<DisciplineId>>(new Set(initialDisciplines));
  const [region, setRegion] = useState<Region | "all">(initialRegion);
  const [club, setClub] = useState(initialClub);
  const [includeTraining, setIncludeTraining] = useState(false);
  const [trainingOpen, setTrainingOpen] = useState(false);
  // Always starts closed: the default is every race and event (no club
  // training), which is what most people want. Filters carried over from
  // the calendar page still apply — the "You'll get" line spells them out.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);

  function chooseDevice(d: Device) {
    setChosenDevice(d);
    setPlatform(null);
    setManualOpen(false);
    trackEvent("subscribe_device_select", { device: d, guessed: d === guessedDevice });
  }

  function choosePlatform(p: Platform) {
    setPlatform(p);
    setManualOpen(false);
    trackEvent("subscribe_platform_select", { platform: p });
  }

  function toggleDiscipline(id: DisciplineId) {
    setDisciplines((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      trackEvent("subscribe_filter_discipline", { discipline: id, active: next.has(id) });
      return next;
    });
    // Training is additive now (kind=all), not a swap — a discipline chip
    // and Club training coexist fine, so there's no reason to touch the
    // training checkbox here any more.
  }

  const feedUrl = useMemo(() => {
    const params = new URLSearchParams();
    // Training rows carry discipline "training". If chips are narrowing the
    // discipline list, training-on has to add "training" to that list too,
    // or ?discipline=cx&kind=all silently returns no training at all.
    const disciplineList = [...disciplines];
    if (includeTraining && disciplineList.length > 0) disciplineList.push("training");
    if (disciplineList.length > 0) params.set("discipline", disciplineList.join(","));
    if (region !== "all") params.set("region", region);
    if (club !== "all") params.set("club", club);
    if (includeTraining) params.set("kind", "all");
    return feedUrlFor(params);
  }, [disciplines, region, club, includeTraining]);

  const webcalUrl = subscribeLinkFor("iphone", feedUrl)!.href;
  const googleUrl = subscribeLinkFor("google", feedUrl)!.href;
  const outlookUrl = (host: string) => outlookAddUrl(host, feedUrl);

  const isFiltered = disciplines.size > 0 || region !== "all" || club !== "all" || includeTraining;

  // Plain-English echo of the filters, so it's obvious what you're about to
  // put in your calendar without decoding the query string. Training is
  // additive to races now, never a replacement for them, so this always
  // leads with races/events and only adds training when it's actually
  // included — it must never claim the feed contains something it doesn't.
  //
  // The club filter only ever narrows training (see app/calendar.ics/
  // route.ts) — it has no effect at all unless training is included, and
  // even then it only scopes the training half, never the races. So the
  // club name is attached to "training" specifically, never trailed after
  // the whole summary the way it used to be — that phrasing implied every
  // race in the feed belonged to that club, which was never true (most
  // races have no club at all) and is actively wrong now that club can't
  // touch races even when one's picked.
  const summary = useMemo(() => {
    const clubName = club !== "all" ? clubs.find((c) => c.id === club)?.name : null;
    const regionPart = region !== "all" ? REGION_OPTIONS.find(([v]) => v === region)?.[1] : null;
    const disciplineLabels =
      disciplines.size > 0
        ? [...disciplines].map((id) => eventDisc(id).label).join(", ")
        : null;
    const racesPart = disciplineLabels ? `${disciplineLabels} events` : "Races and events";

    const kindPart = includeTraining
      ? clubName
        ? `${racesPart}, plus ${clubName} training`
        : `${racesPart} and club training`
      : racesPart;

    return [kindPart, regionPart ? `in ${regionPart}` : null].filter(Boolean).join(" ");
  }, [disciplines, region, club, clubs, includeTraining]);

  const matching = useMemo(() => events.filter((e) => matchesFeed(e, disciplines, region)), [events, disciplines, region]);
  const preview = matching.slice(0, PREVIEW_COUNT);
  const moreCount = matching.length - preview.length;

  function reset() {
    setDisciplines(new Set());
    setRegion("all");
    setClub("all");
    setIncludeTraining(false);
    trackEvent("subscribe_filter_reset", {});
  }

  const oneClick = (href: string, label: string) => (
    <a
      href={href}
      // webcal:// stays in this tab — see SubscribeLink in lib/subscribe-links.ts.
      {...(href.startsWith("webcal:") ? {} : { target: "_blank", rel: "noreferrer" })}
      onClick={() => trackAddToCalendar({ method: "one_tap", platform, source: "subscribe_page", feedUrl })}
      style={primaryButtonStyle}
    >
      <CalendarCheck size={17} /> {label}
    </a>
  );

  const copyStep = (
    <>
      <p style={stepStyle}><span style={stepNumStyle}>1.</span> Copy this link:</p>
      <CopyLink url={feedUrl} platform={platform} />
    </>
  );

  return (
    <div>
      {/* What's going in — shown as it'll look in a calendar app, so it's
          obvious the events land in *their* calendar, not on this site. */}
      <div style={{ border: "1px solid #E4E2DD", background: "#FFFFFF" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: "1px solid #E4E2DD", background: "#F3F2EE" }}>
          <span aria-hidden style={{ width: 10, height: 10, borderRadius: 3, background: "#E0102A" }} />
          <span style={{ fontSize: 13, fontWeight: 700 }}>{CALENDAR_NAME}</span>
          <span className="mono" style={{ marginLeft: "auto", fontSize: 10, letterSpacing: "0.08em", color: "#6B6B66" }}>IN YOUR CALENDAR</span>
        </div>
        <ul aria-label="Coming up in this calendar" style={{ listStyle: "none", margin: 0, padding: "6px 0" }}>
          {preview.map((e) => {
            const d = fmtDay(e.date);
            const disc = eventDisc(e.discipline);
            return (
              <li key={e.id} style={{ display: "flex", gap: 14, alignItems: "center", padding: "8px 16px" }}>
                <div style={{ width: 40, textAlign: "center", flexShrink: 0 }}>
                  <div className="mono" style={{ fontSize: 9.5, color: "#6B6B66", letterSpacing: "0.06em" }}>{d.dow}</div>
                  <div style={{ fontSize: 19, fontWeight: 700, lineHeight: 1.1 }}>{d.day}</div>
                  <div className="mono" style={{ fontSize: 9.5, color: "#6B6B66" }}>{d.mon}</div>
                </div>
                <div style={{ flex: 1, minWidth: 0, borderLeft: `3px solid ${disc.color}`, background: "#F7F6F3", padding: "7px 10px" }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.title}</div>
                  <div style={{ fontSize: 12, color: "#6B6B66", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>All day · {e.venue}</div>
                </div>
              </li>
            );
          })}
          {preview.length === 0 && (
            <li style={{ padding: "10px 16px", fontSize: 13, color: "#6B6B66" }}>
              Nothing scheduled for this selection right now — new events appear automatically as they&apos;re added.
            </li>
          )}
        </ul>
        <div style={{ padding: "10px 16px 14px", borderTop: "1px solid #E4E2DD", fontSize: 13, color: "#4A4A46", lineHeight: 1.6 }}>
          <span>
            You&apos;ll get: <strong style={{ color: "#111111" }}>{summary}</strong>
          </span>
          {moreCount > 0 && <span> — {moreCount} more coming up</span>}
          <span>, plus anything new as it&apos;s added.</span>
          <div style={{ display: "flex", gap: 14, alignItems: "center", marginTop: 10 }}>
            <button type="button" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((o) => !o)} className="mono" style={disclosureStyle}>
              <span aria-hidden style={{ display: "inline-block", transform: filtersOpen ? "rotate(90deg)" : "none", transition: "transform 120ms" }}>
                ▸
              </span>
              Advanced options
            </button>
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
        </div>
      </div>

      {filtersOpen && (
        <div style={{ border: "1px solid #E4E2DD", borderTop: "none", padding: "18px 16px 4px" }}>
          <div style={{ marginBottom: 22 }}>
            <label className="mono" style={labelStyle}>DISCIPLINE</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {availableDisciplines.map((d) => {
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

          <div style={{ marginBottom: 22 }}>
            <Disclosure label="Club training" open={trainingOpen} onToggle={() => setTrainingOpen((o) => !o)}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, color: "#4A4A46", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={includeTraining}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setIncludeTraining(checked);
                    trackEvent("subscribe_filter_training", { active: checked });
                  }}
                />
                Also include club training sessions
              </label>
              {/* Club only ever narrows training (see app/calendar.ics/
                  route.ts), so it lives here rather than beside the race
                  filters where it'd read as narrowing races too. */}
              {clubs.length > 0 && (
                <div style={{ marginTop: 14 }}>
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
                  <p style={{ fontSize: 12, color: "#6B6B66", marginTop: 8, maxWidth: 420 }}>
                    Narrows training to one club&apos;s sessions. Races and events aren&apos;t affected.
                  </p>
                </div>
              )}
            </Disclosure>
          </div>
        </div>
      )}

      <div style={{ marginTop: 40 }}>
        <p className="mono" style={questionStyle}>WHERE DO YOU WANT IT?</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
          {DEVICES.map(({ id, label, Icon }) => (
            <ChoiceCard key={id} active={device === id} onClick={() => chooseDevice(id)}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 700, fontSize: 15 }}>
                <Icon size={18} /> {label}
              </div>
            </ChoiceCard>
          ))}
        </div>
      </div>

      {device && (
        <div style={{ marginTop: 28 }}>
          <p className="mono" style={questionStyle}>WHICH CALENDAR?</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
            {PLATFORMS[device].map((p) => (
              <ChoiceCard key={p.id} active={platform === p.id} onClick={() => choosePlatform(p.id)}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{p.label}</div>
                <div className="mono" style={{ fontSize: 10.5, color: platform === p.id ? "#D8D6D0" : "#6B6B66", marginTop: 3 }}>{p.sub}</div>
              </ChoiceCard>
            ))}
          </div>
        </div>
      )}

      {platform && (
        <div style={{ marginTop: 28, padding: "24px 20px", border: "2px solid #111111", background: "#FFFFFF" }}>
          {platform === "iphone" && (
            <>
              {oneClick(webcalUrl, "Add to iPhone Calendar")}
              <p style={{ ...stepStyle, marginTop: 16 }}>Tap <strong>Subscribe</strong> when your phone asks, then <strong>Add</strong>. That&apos;s it — events show up in the Calendar app and keep themselves up to date.</p>
              <Disclosure label="Didn't work? Set it up by hand" open={manualOpen} onToggle={() => setManualOpen((o) => !o)}>
                {copyStep}
                <p style={{ ...stepStyle, marginTop: 14 }}><span style={stepNumStyle}>2.</span> Open <strong>Settings → Calendar → Accounts → Add Account → Other → Add Subscribed Calendar</strong>.</p>
                <p style={stepStyle}><span style={stepNumStyle}>3.</span> Paste the link into the &ldquo;Server&rdquo; field, then tap <strong>Next</strong> → <strong>Save</strong>.</p>
                <p style={{ fontSize: 12, color: "#6B6B66" }}>The exact menu wording moves around slightly between iOS versions — look for &ldquo;Add Subscribed Calendar&rdquo; under Calendar accounts if this doesn&apos;t match exactly.</p>
              </Disclosure>
            </>
          )}

          {(platform === "android" || platform === "google") && (
            <>
              {oneClick(googleUrl, "Add to Google Calendar")}
              <p style={{ ...stepStyle, marginTop: 16 }}>
                Google Calendar opens and asks to add the calendar — click <strong>Add</strong>. It then appears on every device signed in to that Google account, and Google checks for updates roughly once a day.
              </p>
              {platform === "android" && (
                <Callout>
                  Not showing in the Calendar app on your phone? Open the app → <strong>Settings</strong> → tap <strong>{CALENDAR_NAME}</strong> → turn on <strong>Sync</strong>. Google leaves new subscriptions switched off on Android until you do.
                </Callout>
              )}
              <div style={{ marginTop: 18 }}>
                <Disclosure label="Didn't work? Set it up by hand" open={manualOpen} onToggle={() => setManualOpen((o) => !o)}>
                  {copyStep}
                  <p style={{ ...stepStyle, marginTop: 18 }}><span style={stepNumStyle}>2.</span> Open <a href="https://calendar.google.com" target="_blank" rel="noreferrer" style={{ borderBottom: "1px solid #111111" }}>calendar.google.com</a> in a web browser — on a phone, switch to the desktop site, as the app can&apos;t add calendars by link.</p>
                  <p style={stepStyle}><span style={stepNumStyle}>3.</span> On the left, next to &ldquo;Other calendars&rdquo;, click <strong>+</strong> → <strong>From URL</strong>.</p>
                  <p style={stepStyle}><span style={stepNumStyle}>4.</span> Paste the link and click <strong>Add calendar</strong>.</p>
                  <Callout>
                    <strong>Don&apos;t use &ldquo;Import&rdquo;</strong> — that adds a one-off snapshot that won&apos;t update. Use <strong>Other calendars → From URL</strong> instead, so it keeps itself current.
                  </Callout>
                </Disclosure>
              </div>
            </>
          )}

          {platform === "mac" && (
            <>
              {oneClick(webcalUrl, "Add to Apple Calendar")}
              <p style={{ ...stepStyle, marginTop: 16 }}>Calendar opens and asks to subscribe — click <strong>Subscribe</strong>, set <strong>Auto-refresh</strong> to &ldquo;Every day&rdquo;, then click <strong>OK</strong>.</p>
              <Disclosure label="Didn't work? Set it up by hand" open={manualOpen} onToggle={() => setManualOpen((o) => !o)}>
                {copyStep}
                <p style={{ ...stepStyle, marginTop: 14 }}><span style={stepNumStyle}>2.</span> Open the <strong>Calendar</strong> app → menu bar → <strong>File → New Calendar Subscription…</strong></p>
                <p style={stepStyle}><span style={stepNumStyle}>3.</span> Paste the link and click <strong>Subscribe</strong>.</p>
                <p style={stepStyle}><span style={stepNumStyle}>4.</span> Set <strong>Auto-refresh</strong> to &ldquo;Every day&rdquo;, then click <strong>OK</strong>.</p>
              </Disclosure>
            </>
          )}

          {platform === "outlook" && (
            <>
              {oneClick(outlookUrl("outlook.live.com"), "Add to Outlook")}
              <p style={{ ...stepStyle, marginTop: 16 }}>
                Outlook opens with the calendar ready to add — click <strong>Import</strong> (despite the name, this subscribes, so it keeps itself up to date).
              </p>
              <p style={{ fontSize: 13, color: "#6B6B66", marginBottom: 18 }}>
                Work or school account?{" "}
                <a href={outlookUrl("outlook.office.com")} target="_blank" rel="noreferrer" onClick={() => trackAddToCalendar({ method: "one_tap", platform: "outlook365", source: "subscribe_page", feedUrl })} style={{ borderBottom: "1px solid #6B6B66" }}>
                  Use this link instead
                </a>
                .
              </p>
              <Disclosure label="Didn't work? Set it up by hand" open={manualOpen} onToggle={() => setManualOpen((o) => !o)}>
                {copyStep}
                <p style={{ ...stepStyle, marginTop: 18 }}><span style={stepNumStyle}>2.</span> In Outlook, go to <strong>Add calendar → Subscribe from web</strong>.</p>
                <p style={stepStyle}><span style={stepNumStyle}>3.</span> Paste the link, then click <strong>Import</strong>.</p>
              </Disclosure>
            </>
          )}

          {platform === "other" && (
            <>
              {copyStep}
              <p style={{ ...stepStyle, marginTop: 18 }}><span style={stepNumStyle}>2.</span> In your calendar app, look for an option along the lines of <strong>&ldquo;Subscribe from web&rdquo;</strong>, <strong>&ldquo;Add calendar from URL&rdquo;</strong>, or <strong>&ldquo;Add by link&rdquo;</strong>.</p>
              <p style={stepStyle}><span style={stepNumStyle}>3.</span> Paste the link and confirm.</p>
            </>
          )}

          {/* The one-off import is deliberately the quietest thing here:
              it's a snapshot that never updates, which is almost never what
              anyone actually wants. */}
          <p style={{ fontSize: 12, color: "#6B6B66", marginTop: 24, marginBottom: 0 }}>
            Only want a one-off copy?{" "}
            <a href={feedUrl} download="south-west-kids-cycling.ics" onClick={() => trackAddToCalendar({ method: "download", platform, source: "subscribe_page", feedUrl })} style={{ borderBottom: "1px solid #6B6B66" }}>
              Download the file
            </a>{" "}
            instead — it won&apos;t pick up new events or changes.
          </p>
        </div>
      )}

      {isFiltered && platform && (
        <p style={{ fontSize: 12.5, color: "#6B6B66", marginTop: 24, lineHeight: 1.6, maxWidth: 520 }}>
          Already subscribed and want a different selection? Add this as a second calendar, or remove the old one first.
        </p>
      )}
    </div>
  );
}
