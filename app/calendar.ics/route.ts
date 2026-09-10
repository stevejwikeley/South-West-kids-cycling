import { NextRequest } from "next/server";
import { createEvents, type DateArray, type EventAttributes } from "ics";
import { createClient } from "@/lib/supabase/server";
import type { DisciplineType, EventRow, RegionType } from "@/lib/supabase/types";

// Generated live on every request from the approved events table (spec
// section 9), not a batch job — a new approval shows up on the subscriber's
// next refresh with no separate publish step.
export const dynamic = "force-dynamic";

const DISCIPLINE_VALUES = new Set<DisciplineType>(["cx", "xc", "road", "tri", "gravel", "duathlon", "clusters", "other"]);
const REGION_VALUES = new Set<RegionType>(["devon", "cornwall", "somerset", "both"]);
const DISCIPLINE_LABELS: Record<DisciplineType, string> = {
  cx: "Cyclocross",
  xc: "XC",
  road: "Road",
  tri: "Triathlon",
  gravel: "Gravel",
  duathlon: "Duathlon",
  clusters: "Training session",
  other: "Other",
};
const REGION_LABELS: Record<RegionType, string> = { devon: "Devon", cornwall: "Cornwall", somerset: "Somerset", both: "Devon & Cornwall" };

// Club ids are uuids and go straight into a Postgres `in` filter, so anything
// that isn't uuid-shaped is dropped before it reaches the query — a mistyped
// id would otherwise fail the whole request with a 22P02 cast error rather
// than degrading like the other filters do.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function dateOnly(iso: string): DateArray {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return [y, m, d];
}

// Every event is all-day, full stop — this ignores whatever time-of-day
// might be sitting in start_datetime (including on rows saved before that
// was true) rather than branching on the all_day column.
function toIcsEvent(e: EventRow): EventAttributes {
  // address is only trustworthy alongside a postcode confirming it's a real,
  // checkable location — unconfirmed free-text address on its own is the
  // same kind of unreliable data that mis-geocoded events elsewhere (see
  // lib/geocode.ts), so it's left out here rather than risking bad
  // directions in a subscriber's calendar app.
  const location = [e.venue_name, e.postcode ? e.address : null, e.postcode].filter(Boolean).join(", ");
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
    // GEO gives subscribing calendar apps (Google/Apple/Outlook) an exact
    // pin independent of how the LOCATION text is worded — only set when
    // the event was geocoded, so an event with no postcode/address match
    // just falls back to the app's own free-text lookup on `location`.
    ...(e.lat != null && e.lng != null ? { geo: { lat: e.lat, lon: e.lng } } : {}),
    description,
    url: e.booking_link ?? e.organiser_url,
    status: e.status === "provisional" ? "TENTATIVE" : "CONFIRMED",
    start: dateOnly(e.start_datetime),
    duration: { days: 1 },
  };
}

// Filtered feeds (spec section 9): ?discipline=cx,xc, ?region=devon,cornwall
// and/or ?club=<uuid>,<uuid> — same generation path as the unfiltered feed,
// just a narrower query. Invalid values in any param are dropped rather than
// erroring, so a stale/mistyped filter degrades to "no filter on that
// dimension" instead of a broken subscription. A club id that's well-formed
// but no longer exists is the one exception: it stays in the query and
// yields an empty feed, because silently widening someone's club-only
// subscription back out to every event in the region would be worse.
function parseFilters(searchParams: URLSearchParams) {
  const disciplines = (searchParams.get("discipline") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is DisciplineType => DISCIPLINE_VALUES.has(s as DisciplineType));
  const regions = (searchParams.get("region") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is RegionType => REGION_VALUES.has(s as RegionType));
  const clubs = (searchParams.get("club") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => UUID_RE.test(s));
  return { disciplines, regions, clubs };
}

// "both" means Devon & Cornwall, so an event stored that way belongs in
// either of those feeds — the same widening the calendar and embed views
// already do (components/CalendarPage.tsx, app/embed/page.tsx). Without it a
// ?region=devon subscriber silently loses every cross-county event.
function regionsToMatch(regions: RegionType[]): RegionType[] {
  const wanted = new Set<RegionType>(regions);
  if (wanted.has("devon") || wanted.has("cornwall")) wanted.add("both");
  return [...wanted];
}

// Subscribers commonly add more than one of these feeds, and the calendar
// name is all their app shows to tell them apart — so it spells out the
// filters, club names included (a raw uuid would be useless there).
function feedName(disciplines: DisciplineType[], regions: RegionType[], clubNames: string[]): string {
  const parts = [
    clubNames.length ? clubNames.join("/") : null,
    disciplines.length ? disciplines.map((d) => DISCIPLINE_LABELS[d]).join("/") : null,
    regions.length ? regions.map((r) => REGION_LABELS[r]).join("/") : null,
  ].filter(Boolean);
  return parts.length ? `South West Kids Cycling — ${parts.join(", ")}` : "South West Kids Cycling";
}

export async function GET(request: NextRequest) {
  const { disciplines, regions, clubs } = parseFilters(request.nextUrl.searchParams);

  const supabase = await createClient();
  let query = supabase.from("events").select("*").eq("approved", true).neq("status", "cancelled");
  if (disciplines.length) query = query.in("discipline", disciplines);
  if (regions.length) query = query.in("region", regionsToMatch(regions));
  if (clubs.length) query = query.in("club_id", clubs);
  const { data, error } = await query.order("start_datetime", { ascending: true });

  if (error) {
    return new Response("Failed to load events", { status: 500 });
  }

  // Names only — the filtering above already used the ids, so a club that has
  // since been deleted just drops out of the title without changing which
  // events the feed contains.
  const clubNames = clubs.length
    ? ((await supabase.from("clubs").select("name").in("id", clubs).order("name")).data ?? []).map(
        (c) => (c as { name: string }).name
      )
    : [];

  const { error: icsError, value } = createEvents((data as EventRow[]).map(toIcsEvent), {
    calName: feedName(disciplines, regions, clubNames),
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
