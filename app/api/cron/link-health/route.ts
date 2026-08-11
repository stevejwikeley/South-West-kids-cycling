import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { EventRow } from "@/lib/supabase/types";

// Spec section 4.5: "Periodic booking-link health checks (does the link
// still resolve?) catch dead links before a subscriber hits one." Reuses
// the field_flags mechanism (spec 4.2) rather than adding new schema — a
// broken link becomes a "needs verification" flag on booking_link, admin
// visible only, same as an extraction-uncertain field.
export const maxDuration = 60;

const BROKEN_LINK_PREFIX = "Link check failed";

function isLinkHealthFlag(value: string | undefined): boolean {
  return !!value && value.startsWith(BROKEN_LINK_PREFIX);
}

type CheckOutcome = "healthy" | "broken" | "inconclusive";

// Several real sources this project links to (British Cycling,
// sportivaevents.co.uk) sit behind Cloudflare/WAF protection that 403s any
// server-side request regardless of whether the link is actually valid —
// confirmed directly against these exact domains earlier in this project.
// A 403 (or 401/429/5xx — auth walls, rate limits, transient host issues)
// is not reliable evidence of a dead link in this environment, so only
// unambiguous signals (404, DNS/connection failure) are treated as broken.
// Spoofing a browser UA to get a "real" answer past the WAF would be
// bot-detection evasion; the honest fix is not drawing a conclusion from a
// signal that isn't trustworthy here, not working around the protection.
async function checkLink(url: string): Promise<{ outcome: CheckOutcome; detail?: string }> {
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SWKidsCyclingBot/1.0)" },
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) return { outcome: "healthy" };
    if (res.status === 404 || res.status === 410) {
      return { outcome: "broken", detail: `${BROKEN_LINK_PREFIX}: HTTP ${res.status}` };
    }
    return { outcome: "inconclusive", detail: `HTTP ${res.status} — may be a bot block, not necessarily broken` };
  } catch (e) {
    const message = e instanceof Error ? e.message : "";
    // DNS/connection failures are a genuine dead-domain signal; timeouts are
    // more often a slow or bot-guarded server than an actually dead link.
    if (/ENOTFOUND|ECONNREFUSED|fetch failed/i.test(message)) {
      return { outcome: "broken", detail: `${BROKEN_LINK_PREFIX}: ${message}` };
    }
    return { outcome: "inconclusive", detail: message || "request failed" };
  }
}

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("approved", true)
    .eq("booking_status", "open")
    .neq("status", "cancelled")
    .gte("start_datetime", new Date().toISOString())
    .not("booking_link", "is", null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const events = (data as EventRow[]) ?? [];
  const results: { id: string; title: string; outcome: CheckOutcome; detail?: string }[] = [];

  for (const event of events) {
    if (!event.booking_link) continue;

    const { outcome, detail } = await checkLink(event.booking_link);
    const currentFlags = { ...(event.field_flags as Record<string, string> | null) };
    const hadLinkHealthFlag = isLinkHealthFlag(currentFlags.booking_link);

    results.push({ id: event.id, title: event.title, outcome, detail });

    if (outcome === "broken") {
      currentFlags.booking_link = detail!;
    } else if (hadLinkHealthFlag) {
      // Healthy, or inconclusive (we can't confirm it's actually broken) —
      // either way, clear a flag this check itself set. An extraction-set
      // "needs verification" reason on the same field stays untouched.
      delete currentFlags.booking_link;
    } else {
      continue;
    }

    await supabase
      .from("events")
      .update({ field_flags: Object.keys(currentFlags).length ? currentFlags : null })
      .eq("id", event.id);
  }

  return NextResponse.json({
    checked: events.length,
    broken: results.filter((r) => r.outcome === "broken").length,
    inconclusive: results.filter((r) => r.outcome === "inconclusive").length,
    results,
  });
}
