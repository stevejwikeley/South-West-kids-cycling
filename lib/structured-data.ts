import type { CalendarEvent } from "./types.ts";
import { eventDisc } from "./mock-data.ts";

const STATUS_MAP: Record<CalendarEvent["status"], string> = {
  confirmed: "https://schema.org/EventScheduled",
  provisional: "https://schema.org/EventScheduled",
  cancelled: "https://schema.org/EventCancelled",
};

const REGION_LABEL: Record<CalendarEvent["region"], string> = {
  devon: "Devon",
  cornwall: "Cornwall",
  somerset: "Somerset",
  bristol: "Bristol",
  both: "Devon & Cornwall",
};

// `region`/`status` are database enums like `discipline` — a value added by
// a future migration would otherwise come back `undefined` from these maps
// and get interpolated as the literal string "undefined" into the JSON-LD
// this app publishes on the public home page. Route every read through
// these total accessors instead of indexing the maps directly. `r`/`s` are
// typed as `string` (not the narrow union) because that's the actual
// runtime risk: the union claims these maps are exhaustive, but a raw DB
// value can outrun it. `EventScheduled` is the right default for an unknown
// status — schema.org treats missing/unknown as scheduled, and defaulting
// to `EventCancelled` would be actively harmful.
const regionLabel = (r: string) => REGION_LABEL[r as CalendarEvent["region"]] ?? "South West England";
const statusUrl = (s: string) => STATUS_MAP[s as CalendarEvent["status"]] ?? "https://schema.org/EventScheduled";

// Google's Event rich-result guidance recommends image and a fully-formed
// address where available — reusing the site's own branded OG image here
// since individual events don't have their own.
const SITE_IMAGE = "https://www.southwestkidscycling.uk/opengraph-image";

export function eventsToJsonLd(events: CalendarEvent[]) {
  return events.map((e) => {
    const disc = eventDisc(e.discipline);
    const ageText = e.ages.map((a) => a.toUpperCase()).join(", ");

    return {
      "@type": "SportsEvent",
      name: e.title,
      startDate: e.date,
      eventStatus: statusUrl(e.status),
      eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
      sport: disc.label,
      description: `${disc.label} event for age categories ${ageText}, ${e.kidsOnly ? "kids only" : "kids racing alongside adults"}. ${regionLabel(e.region)}, South West England.`,
      image: [SITE_IMAGE],
      location: {
        "@type": "Place",
        name: e.venue,
        address: {
          "@type": "PostalAddress",
          // streetAddress only included alongside a postcode confirming
          // it — see lib/geocode.ts for why unconfirmed free-text address
          // isn't trusted on its own elsewhere in the app.
          ...(e.postcode && e.address ? { streetAddress: e.address } : {}),
          ...(e.postcode ? { postalCode: e.postcode } : {}),
          addressRegion: regionLabel(e.region),
          addressCountry: "GB",
        },
      },
      ...(e.bookingStatus === "open" && e.booking
        ? {
            offers: {
              "@type": "Offer",
              url: e.booking,
              availability: "https://schema.org/InStock",
            },
          }
        : {}),
      url: e.organiserUrl,
    };
  });
}
