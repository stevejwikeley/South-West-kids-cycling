import "server-only";
import { createHash } from "node:crypto";
import { createClient } from "@/lib/supabase/server";

// Shared by /calendar.ics and /embed — every hit against either route is
// anonymous by definition (neither is behind auth), so there's no user
// identity to log against. This exists purely to answer two questions
// calendar_feed_hits already has the shape for: is a fetcher a recurring
// subscriber or a one-off download (see calendar_feed_subscribers, which
// needs fetches on 2+ distinct days to count someone as subscribed), and
// which sites have actually embedded the widget (calendar_embed_referrers).

// A stable-but-non-reversible-in-practice identifier for "the same client
// fetching again". Built from IP + User-Agent so recurring fetches from a
// calendar app collapse to one fingerprint across days — the raw IP itself
// is never stored, only this hash.
function fingerprintFrom(ip: string, userAgent: string): string {
  return createHash("sha256").update(`${ip}|${userAgent}`).digest("hex");
}

// Vercel sets x-forwarded-for on every request; the first entry is the
// original client, everything after it is intermediate proxies. Falls back
// to a constant rather than throwing, so a request arriving without the
// header (e.g. a direct hit in local dev) still produces a stable — just
// less precise — fingerprint instead of breaking the calling route.
function clientIp(headerList: Headers): string {
  const forwarded = headerList.get("x-forwarded-for");
  return forwarded ? forwarded.split(",")[0].trim() : "unknown";
}

// Call from inside next/server's `after()`, not directly in the request
// path — logging must never add latency to a subscriber's calendar fetch
// or an embedding site's page load. Errors are swallowed rather than
// surfaced: there's no reasonable user-facing response to a failed
// analytics write on either route.
export async function logFeedHit(headerList: Headers, feed: "calendar.ics" | "embed"): Promise<void> {
  try {
    const userAgent = headerList.get("user-agent");
    // Referer is embed-only data by design: calendar client software
    // fetching /calendar.ics doesn't send one, and it isn't the thing this
    // feed's own instrumentation is answering — recording it there anyway
    // would blur "which club site embedded this" into "did a browser once
    // navigate here with a referrer header intact".
    const referer = feed === "embed" ? headerList.get("referer") : null;
    const fingerprint = fingerprintFrom(clientIp(headerList), userAgent ?? "");

    const supabase = await createClient();
    await supabase.from("calendar_feed_hits").insert({
      fingerprint,
      user_agent: userAgent,
      referer,
      feed,
    });
  } catch {
    // Swallow — see the comment above the function.
  }
}
