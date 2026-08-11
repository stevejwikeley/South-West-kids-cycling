import { NextRequest } from "next/server";
import { createEvents, type DateArray, type EventAttributes } from "ics";
import { createClient } from "@/lib/supabase/server";
import type { DisciplineType, EventRow, RegionType } from "@/lib/supabase/types";

// Generated live on every request from the approved events table (spec
// section 9), not a batch job — a new approval shows up on the subscriber's
// next refresh with no separate publish step.
export const dynamic = "force-dynamic";

const DISCIPLINE_VALUES = new Set<DisciplineType>(["cx", "xc", "road", "tri", "gravel", "duathlon", "clusters", "other"]);
const REGION_VALUES = new Set<RegionType>(["devon", "cornwall", "both"]);
const DISCIPLINE_LABELS: Record<DisciplineType, string> = {
  cx: "Cyclocross",
  xc: "XC",
  road: "Road",
  tri: "Triathlon",
  gravel: "Gravel",
  duathlon: "Duathlon",
  clusters: "Club Clusters",
  other: "Other",
};
const REGION_LABELS: Record<RegionType, string> = { devon: "Devon", cornwall: "Cornwall", both: "Devon & Cornwall" };

function dateOnly(iso: string): DateArray {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return [y, m, d];
}

// Every event is all-day, full stop — this ignores whatever time-of-day
// might be sitting in start_datetime (including on rows saved before that
// was true) rather than branching on the all_day column.
function toIcsEvent(e: EventRow): EventAttributes {
  const location = [e.venue_name, e.address, e.postcode].filter(Boolean).join(", ");
  const description = [
    `Discipline: ${e.discipline.toUpperCase()}`,
    `Status: ${e.status}`,
    e.booking_link ? `Booking: ${e.booking_link}` : `More info: ${e.organiser_url}`,
    e.organiser_contact ? `Organiser contact: ${e.organiser_contact}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    uid: `${e.id}@southwestkidscycling.co.uk`,
    title: e.title,
    location,
    description,
    url: e.booking_link ?? e.organiser_url,
    status: e.status === "provisional" ? "TENTATIVE" : "CONFIRMED",
    start: dateOnly(e.start_datetime),
    duration: { days: 1 },
  };
}

// Filtered feeds (spec section 9): ?discipline=cx,xc and/or ?region=devon,
// same generation path as the unfiltered feed — just a narrower query.
// Invalid values in either param are dropped rather than erroring, so a
// stale/mistyped filter degrades to "no filter on that dimension" instead
// of a broken subscription.
function parseFilters(searchParams: URLSearchParams) {
  const disciplines = (searchParams.get("discipline") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is DisciplineType => DISCIPLINE_VALUES.has(s as DisciplineType));
  const regions = (searchParams.get("region") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is RegionType => REGION_VALUES.has(s as RegionType));
  return { disciplines, regions };
}

function feedName(disciplines: DisciplineType[], regions: RegionType[]): string {
  const parts = [
    disciplines.length ? disciplines.map((d) => DISCIPLINE_LABELS[d]).join("/") : null,
    regions.length ? regions.map((r) => REGION_LABELS[r]).join("/") : null,
  ].filter(Boolean);
  return parts.length ? `South West Kids Cycling — ${parts.join(", ")}` : "South West Kids Cycling";
}

export async function GET(request: NextRequest) {
  const { disciplines, regions } = parseFilters(request.nextUrl.searchParams);

  const supabase = await createClient();
  let query = supabase.from("events").select("*").eq("approved", true).neq("status", "cancelled");
  if (disciplines.length) query = query.in("discipline", disciplines);
  if (regions.length) query = query.in("region", regions);
  const { data, error } = await query.order("start_datetime", { ascending: true });

  if (error) {
    return new Response("Failed to load events", { status: 500 });
  }

  const { error: icsError, value } = createEvents((data as EventRow[]).map(toIcsEvent), {
    calName: feedName(disciplines, regions),
    productId: "-//South West Kids Cycling//Calendar//EN",
  });

  if (icsError || !value) {
    return new Response("Failed to generate calendar", { status: 500 });
  }

  // The `ics` package already emits X-PUBLISHED-TTL:PT1H by default (not
  // configurable, but already the value we'd want). REFRESH-INTERVAL is the
  // newer RFC 7986 equivalent it doesn't emit — added here since some
  // clients (Google Calendar reliably; iOS Calendar largely ignores both and
  // keeps its own schedule regardless) poll faster with it present. Neither
  // can force an instant push to a subscribed feed — that's a fundamental
  // limit of the pull-based subscription model, not something a server can
  // override.
  const withRefreshHint = value.replace(
    "CALSCALE:GREGORIAN",
    "CALSCALE:GREGORIAN\r\nREFRESH-INTERVAL;VALUE=DURATION:PT1H"
  );

  return new Response(withRefreshHint, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="calendar.ics"',
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
