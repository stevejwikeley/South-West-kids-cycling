import { createEvents, type DateArray, type EventAttributes } from "ics";
import { createClient } from "@/lib/supabase/server";
import type { EventRow } from "@/lib/supabase/types";

// Generated live on every request from the approved events table (spec
// section 9), not a batch job — a new approval shows up on the subscriber's
// next refresh with no separate publish step.
export const dynamic = "force-dynamic";

function dateOnly(iso: string): DateArray {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return [y, m, d];
}

function utcDateTime(iso: string): DateArray {
  const d = new Date(iso);
  return [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes()];
}

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

  const timing = e.all_day
    ? { start: dateOnly(e.start_datetime), duration: { days: 1 } }
    : e.end_datetime
      ? { start: utcDateTime(e.start_datetime), startInputType: "utc" as const, end: utcDateTime(e.end_datetime), endInputType: "utc" as const }
      : { start: utcDateTime(e.start_datetime), startInputType: "utc" as const, duration: { hours: 2 } };

  return {
    uid: `${e.id}@southwestkidscycling.co.uk`,
    title: e.title,
    location,
    description,
    url: e.booking_link ?? e.organiser_url,
    status: e.status === "provisional" ? "TENTATIVE" : "CONFIRMED",
    ...timing,
  };
}

export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("approved", true)
    .neq("status", "cancelled")
    .order("start_datetime", { ascending: true });

  if (error) {
    return new Response("Failed to load events", { status: 500 });
  }

  const { error: icsError, value } = createEvents((data as EventRow[]).map(toIcsEvent), {
    calName: "South West Kids Cycling",
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
