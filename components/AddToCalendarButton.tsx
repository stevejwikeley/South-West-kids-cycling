"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Calendar, ChevronDown } from "lucide-react";
import { trackAddToCalendar, trackEvent } from "@/lib/analytics";
import { feedUrlFor, outlookAddUrl, subscribeLinkFor, type Platform } from "@/lib/subscribe-links";
import { useDetectedPlatform } from "./useDetectedPlatform";

// The one-tap subscribe button: guesses the visitor's calendar app from
// their device and links straight into that app's own subscribe flow, so
// there's a single obvious button rather than a choice. Until the guess is
// in (the server render) or when there's nothing to guess from, it falls
// back to the /subscribe page, which walks through every option.
//
// On a computer the guess can be wrong (a Windows PC could belong to an
// Outlook user), so a ▾ beside it opens the other calendars without leaving
// the page.
interface MenuOption {
  key: string;
  label: string;
  platform: string;
  href?: string;
  newTab?: boolean;
  copy?: boolean;
}

function menuOptions(current: Platform, feedUrl: string): MenuOption[] {
  const google = subscribeLinkFor("google", feedUrl)!;
  const apple = subscribeLinkFor("mac", feedUrl)!;
  const all: MenuOption[] = [
    { key: "google", label: "Google Calendar", platform: "google", href: google.href, newTab: google.newTab },
    { key: "apple", label: "Apple Calendar", platform: "mac", href: apple.href, newTab: apple.newTab },
    { key: "outlook", label: "Outlook", platform: "outlook", href: outlookAddUrl("outlook.live.com", feedUrl), newTab: true },
    { key: "outlook365", label: "Outlook (work or school)", platform: "outlook365", href: outlookAddUrl("outlook.office.com", feedUrl), newTab: true },
    { key: "copy", label: "Copy link", platform: "other", copy: true },
  ];
  // Leave out whichever app the main button already is.
  const currentKey = current === "android" || current === "google" ? "google" : current === "iphone" || current === "mac" ? "apple" : current;
  return all.filter((o) => o.key !== currentKey);
}

export default function AddToCalendarButton({
  feedParams,
  fallbackHref,
  source,
  style,
  className,
  menuAlign = "left",
}: {
  feedParams: URLSearchParams;
  fallbackHref: string;
  source: string;
  style: React.CSSProperties;
  className?: string;
  // Which edge the menu lines up with — "right" for a button near the right
  // of the screen, so the menu doesn't run off it.
  menuAlign?: "left" | "right";
}) {
  const platform = useDetectedPlatform();
  const feedUrl = feedUrlFor(feedParams);
  const link = platform ? subscribeLinkFor(platform, feedUrl) : null;
  const filtered = feedParams.size > 0;
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close on a click anywhere else, or Escape.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!platform || !link) {
    return (
      <Link href={fallbackHref} onClick={() => trackEvent("subscribe_click", { source, filtered })} className={className} style={style}>
        <Calendar size={15} /> {filtered ? "Subscribe to these events" : "Subscribe to calendar"}
      </Link>
    );
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(feedUrl);
      setCopied(true);
      trackAddToCalendar({ method: "copy_link", platform: "other", source, feedUrl });
      setTimeout(() => { setCopied(false); setOpen(false); }, 1500);
    } catch {
      // Clipboard blocked — /subscribe shows the link in a field to copy by hand.
      window.location.href = fallbackHref;
    }
  }

  // The ▾ borrows the main button's look, with a hairline between the two.
  const caretStyle: React.CSSProperties = {
    ...style,
    width: "auto",
    padding: "0 10px",
    gap: 0,
    justifyContent: "center",
    borderLeft: "1px solid rgba(127, 127, 127, 0.45)",
  };
  const itemStyle: React.CSSProperties = {
    display: "block",
    width: "100%",
    textAlign: "left",
    padding: "10px 14px",
    fontSize: 13.5,
    fontWeight: 600,
    color: "#111111",
    background: "none",
    border: "none",
    cursor: "pointer",
    fontFamily: "var(--font-inter), sans-serif",
    letterSpacing: "normal",
  };

  return (
    <div ref={wrapRef} style={{ position: "relative", display: "inline-flex", alignItems: "stretch" }}>
      <a
        href={link.href}
        {...(link.newTab ? { target: "_blank", rel: "noreferrer" } : {})}
        onClick={() => trackAddToCalendar({ method: "one_tap", platform, source, feedUrl })}
        className={className}
        style={style}
      >
        <Calendar size={15} /> {link.label}
      </a>
      <button
        type="button"
        aria-label="Add to a different calendar"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          if (!open) trackEvent("add_to_calendar_menu_open", { source, platform });
          setOpen((o) => !o);
        }}
        className={className}
        style={caretStyle}
      >
        <ChevronDown size={15} />
      </button>

      {open && (
        <div
          role="menu"
          style={{ position: "absolute", top: "calc(100% + 6px)", [menuAlign]: 0, zIndex: 40, minWidth: 250, background: "#FFFFFF", border: "1px solid #D8D6D0", boxShadow: "0 8px 28px rgba(17,17,17,0.14)", padding: "6px 0" }}
        >
          <div className="mono" style={{ fontSize: 10, letterSpacing: "0.08em", color: "#6B6B66", padding: "6px 14px 4px" }}>ADD TO A DIFFERENT CALENDAR</div>
          {menuOptions(platform, feedUrl).map((o) =>
            o.copy ? (
              <button key={o.key} type="button" role="menuitem" onClick={copyLink} className="row-hover" style={itemStyle}>
                {copied ? "Copied!" : o.label}
              </button>
            ) : (
              <a
                key={o.key}
                role="menuitem"
                href={o.href}
                {...(o.newTab ? { target: "_blank", rel: "noreferrer" } : {})}
                onClick={() => { trackAddToCalendar({ method: "one_tap", platform: o.platform, source, feedUrl }); setOpen(false); }}
                className="row-hover"
                style={itemStyle}
              >
                {o.label}
              </a>
            )
          )}
          <div style={{ borderTop: "1px solid #E4E2DD", marginTop: 6 }} />
          <Link href={fallbackHref} role="menuitem" onClick={() => trackEvent("subscribe_click", { source: `${source}_menu`, filtered })} style={{ ...itemStyle, fontWeight: 500, color: "#6B6B66", fontSize: 12.5 }}>
            More options and email updates
          </Link>
        </div>
      )}
    </div>
  );
}
