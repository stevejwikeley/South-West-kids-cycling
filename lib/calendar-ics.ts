import { createEvent, createEvents, type DateArray, type EventAttributes } from "ics";
import { httpUrlOrNull } from "@/lib/safe-url";
import type { PublicEventRow } from "@/lib/supabase/columns";

function dateOnly(iso: string): DateArray {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return [y, m, d];
}

function utcDateTime(iso: string): DateArray {
  const d = new Date(iso);
  return [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes()];
}

export function toIcsEvent(e: PublicEventRow): EventAttributes {
  // The ics library rejects the *entire* calendar if any one event has a URL
  // it doesn't like, so only ever hand it validated http(s) links.
  const bookingLink = httpUrlOrNull(e.booking_link);
  const organiserUrl = httpUrlOrNull(e.organiser_url);
  const location = [e.venue_name, e.address, e.postcode].filter(Boolean).join(", ");
  const description = [
    `Discipline: ${e.discipline.toUpperCase()}`,
    `Status: ${e.status}`,
    bookingLink ? `Booking: ${bookingLink}` : organiserUrl ? `More info: ${organiserUrl}` : null,
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
    uid: `${e.id}@southwestkidscycling.uk`,
    title: e.title,
    location,
    description,
    ...((bookingLink ?? organiserUrl) ? { url: (bookingLink ?? organiserUrl)! } : {}),
    status: e.status === "provisional" ? "TENTATIVE" : "CONFIRMED",
    ...timing,
  };
}

// Belt and braces: drop (and log) any single event the library still refuses,
// rather than letting one bad row take the feed down for every subscriber.
export function buildCalendar(rows: PublicEventRow[]): { error?: Error; value?: string } {
  const icsEvents = rows.map(toIcsEvent).filter((attrs) => {
    const { error } = createEvent(attrs);
    if (error) console.error(`calendar.ics: skipping event ${attrs.uid}: ${error.message}`);
    return !error;
  });

  const { error, value } = createEvents(icsEvents, {
    calName: "South West Kids Cycling",
    productId: "-//South West Kids Cycling//Calendar//EN",
  });
  return { error: error ?? undefined, value: value ?? undefined };
}
