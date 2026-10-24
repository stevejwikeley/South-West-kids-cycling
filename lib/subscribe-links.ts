// One-tap calendar subscription, shared by the subscribe page and the
// calendar's own subscribe buttons so the device guess and the links can't
// drift apart between them.

// Always production, whatever this page is running on — a feed URL is copied
// into someone's calendar app and stays there for years, so it must never be
// a preview or localhost origin. Same reasoning as the embed builder.
export const SITE_URL = "https://www.southwestkidscycling.uk";
export const CALENDAR_NAME = "South West Kids Cycling";

export type Platform = "iphone" | "android" | "google" | "mac" | "outlook" | "other";

// Best guess at the calendar app from the user agent. Phones are reliable —
// an iPhone means Apple Calendar, an Android phone means Google Calendar.
// Computers are a guess: a Mac gets Apple Calendar, and everything else gets
// Google Calendar as the most common family calendar. Either way the visitor
// can switch to a different calendar, so a wrong guess costs one click.
// iPadOS Safari reports itself as a Mac, which lands on the same webcal link.
export function detectPlatform(userAgent: string): Platform | null {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "iphone";
  if (/Android/i.test(userAgent)) return "android";
  if (/Macintosh/i.test(userAgent)) return "mac";
  if (/Windows|Linux|CrOS/i.test(userAgent)) return "google";
  return null;
}

// Same params /calendar.ics takes. Anything not set is left off, so the
// unfiltered feed stays the bare URL.
export function feedUrlFor(params: URLSearchParams): string {
  const query = params.toString();
  return `${SITE_URL}/calendar.ics${query ? `?${query}` : ""}`;
}

export interface SubscribeLink {
  href: string;
  label: string;
  // Google and Outlook are web pages, so they open in a new tab; webcal://
  // hands straight off to the calendar app.
  external: boolean;
}

// webcal:// is what tells Apple Calendar to *subscribe* rather than import a
// one-off copy. Google and Outlook take the feed through their own "add by
// URL" pages instead. "other" has no one-tap route — it's copy and paste.
export function subscribeLinkFor(platform: Platform, feedUrl: string): SubscribeLink | null {
  const webcalUrl = feedUrl.replace(/^https:/, "webcal:");
  switch (platform) {
    case "iphone":
      return { href: webcalUrl, label: "Add to iPhone Calendar", external: false };
    case "mac":
      return { href: webcalUrl, label: "Add to Apple Calendar", external: false };
    case "android":
    case "google":
      return { href: `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcalUrl)}`, label: "Add to Google Calendar", external: true };
    case "outlook":
      return { href: outlookAddUrl("outlook.live.com", feedUrl), label: "Add to Outlook", external: true };
    case "other":
      return null;
  }
}

export function outlookAddUrl(host: string, feedUrl: string): string {
  return `https://${host}/calendar/0/addfromweb?url=${encodeURIComponent(feedUrl)}&name=${encodeURIComponent(CALENDAR_NAME)}`;
}
