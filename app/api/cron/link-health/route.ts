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

async function checkLink(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SWKidsCyclingBot/1.0)" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return `${BROKEN_LINK_PREFIX}: HTTP ${res.status}`;
    return null;
  } catch (e) {
    const detail = e instanceof Error ? e.message : "unreachable";
    return `${BROKEN_LINK_PREFIX}: ${detail}`;
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
  const results: { id: string; title: string; ok: boolean; detail?: string }[] = [];

  for (const event of events) {
    if (!event.booking_link) continue;

    const failureReason = await checkLink(event.booking_link);
    const currentFlags = { ...(event.field_flags as Record<string, string> | null) };
    const hadLinkHealthFlag = isLinkHealthFlag(currentFlags.booking_link);

    if (failureReason) {
      currentFlags.booking_link = failureReason;
      results.push({ id: event.id, title: event.title, ok: false, detail: failureReason });
    } else if (hadLinkHealthFlag) {
      // Only clear a flag this check itself set — an extraction-set
      // "needs verification" reason on the same field stays untouched.
      delete currentFlags.booking_link;
      results.push({ id: event.id, title: event.title, ok: true, detail: "recovered" });
    } else {
      continue;
    }

    await supabase
      .from("events")
      .update({ field_flags: Object.keys(currentFlags).length ? currentFlags : null })
      .eq("id", event.id);
  }

  return NextResponse.json({ checked: events.length, flagged: results.filter((r) => !r.ok).length, results });
}
