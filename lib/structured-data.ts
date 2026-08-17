import type { CalendarEvent } from "@/lib/types";
import { eventDisc } from "@/lib/mock-data";

const STATUS_MAP: Record<CalendarEvent["status"], string> = {
  confirmed: "https://schema.org/EventScheduled",
  provisional: "https://schema.org/EventScheduled",
  cancelled: "https://schema.org/EventCancelled",
};

const REGION_LABEL: Record<CalendarEvent["region"], string> = {
  devon: "Devon",
  cornwall: "Cornwall",
  somerset: "Somerset",
  both: "Devon & Cornwall",
};

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
      eventStatus: STATUS_MAP[e.status],
      eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
      sport: disc.label,
      description: `${disc.label} event for age categories ${ageText}, ${e.kidsOnly ? "kids only" : "kids racing alongside adults"}. ${REGION_LABEL[e.region]}, South West England.`,
      image: [SITE_IMAGE],
      location: {
        "@type": "Place",
        name: e.venue,
        address: {
          "@type": "PostalAddress",
          ...(e.address ? { streetAddress: e.address } : {}),
          ...(e.postcode ? { postalCode: e.postcode } : {}),
          addressRegion: REGION_LABEL[e.region],
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
