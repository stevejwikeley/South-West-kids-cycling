"use client";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

// Thin wrapper so call sites don't need to guard against gtag being
// missing (blocked by an ad blocker, or not yet loaded).
export function trackEvent(name: string, params?: Record<string, unknown>) {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  window.gtag("event", name, params);
}

// The one event for "someone put the calendar in their calendar app", so GA
// can count it as a single key event however it happened:
//   method   one_tap (an "Add to …" button), copy_link (copied the feed
//            URL to paste in by hand) or download (one-off .ics file)
//   platform the calendar app the link was for, or "unknown"
//   source   where on the site it was clicked
//   feed_filters the feed's query string ("none" for the full calendar),
//            so filtered subscriptions can be told apart
export function trackAddToCalendar({
  method,
  platform,
  source,
  feedUrl,
}: {
  method: "one_tap" | "copy_link" | "download";
  platform: string | null;
  source: string;
  feedUrl: string;
}) {
  const query = feedUrl.split("?")[1] ?? "";
  trackEvent("add_to_calendar", {
    method,
    platform: platform ?? "unknown",
    source,
    filtered: query !== "",
    feed_filters: query || "none",
  });
}
