import { utcIsoToUkLocalParts } from "@/lib/uk-time";
import type {
  AgeCategory,
  BookingStatusType,
  DisciplineType,
  EventRow,
  EventSeriesRow,
  EventStatus,
  RegionType,
  Weekday,
} from "@/lib/supabase/types";

export type EventSeriesFormValues = Pick<
  EventSeriesRow,
  | "title"
  | "discipline"
  | "status"
  | "weekdays"
  | "start_date"
  | "until_date"
  | "venue_name"
  | "address"
  | "postcode"
  | "region"
  | "age_categories"
  | "kids_only"
  | "booking_status"
  | "booking_link"
  | "organiser_url"
  | "organiser_name"
  | "organiser_contact"
  | "club_id"
  | "description"
>;

// Values carried over when converting an existing one-off event into a
// series (EventForm's "Convert to recurring event" link) — everything
// except the recurrence-only fields (weekdays/until_date), which the
// organiser still has to choose.
export type SeriesPrefill = Omit<EventSeriesFormValues, "weekdays" | "until_date">;

export function eventRowToSeriesPrefill(event: EventRow): SeriesPrefill {
  return {
    title: event.title,
    discipline: event.discipline,
    status: event.status,
    start_date: utcIsoToUkLocalParts(event.start_datetime).date,
    venue_name: event.venue_name,
    address: event.address,
    postcode: event.postcode,
    region: event.region,
    age_categories: event.age_categories,
    kids_only: event.kids_only,
    booking_status: event.booking_status,
    booking_link: event.booking_link,
    organiser_url: event.organiser_url,
    organiser_name: event.organiser_name,
    organiser_contact: event.organiser_contact,
    club_id: event.club_id,
    description: event.description,
  };
}

// Mirrors parse-event-form.ts's validation, plus the recurrence-specific
// fields (weekdays, start_date, until_date) in place of the single `date`.
export function parseSeriesForm(
  formData: FormData
): { ok: false; error: string } | { ok: true; values: EventSeriesFormValues } {
  const title = String(formData.get("title") ?? "").trim();
  const discipline = String(formData.get("discipline") ?? "") as DisciplineType;
  const status = String(formData.get("status") ?? "confirmed") as EventStatus;
  const weekdays = formData
    .getAll("weekdays")
    .map(Number)
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 7) as Weekday[];
  const startDate = String(formData.get("start_date") ?? "");
  const untilDate = String(formData.get("until_date") ?? "");
  const venueName = String(formData.get("venue_name") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim() || null;
  const postcode = String(formData.get("postcode") ?? "").trim() || null;
  const region = String(formData.get("region") ?? "") as RegionType;
  const ages = formData.getAll("ages").map(String) as AgeCategory[];
  const kidsOnly = formData.get("kids_only") === "on";
  const bookingStatus = String(formData.get("booking_status") ?? "planned") as BookingStatusType;
  const bookingLink = String(formData.get("booking_link") ?? "").trim() || null;
  const organiserUrl = String(formData.get("organiser_url") ?? "").trim();
  const organiserName = String(formData.get("organiser_name") ?? "").trim() || null;
  const organiserContact = String(formData.get("organiser_contact") ?? "").trim() || null;
  const clubId = String(formData.get("club_id") ?? "").trim() || null;
  const description = String(formData.get("description") ?? "").trim() || null;

  if (!title) return { ok: false, error: "Title is required." };
  if (!discipline) return { ok: false, error: "Discipline is required." };
  if (weekdays.length === 0) return { ok: false, error: "Pick at least one day of the week." };
  if (!startDate) return { ok: false, error: "Start date is required." };
  if (!untilDate) return { ok: false, error: "\"Repeats until\" date is required." };
  if (untilDate < startDate) return { ok: false, error: "\"Repeats until\" must be on or after the start date." };
  if (!venueName) return { ok: false, error: "Venue is required." };
  if (!region) return { ok: false, error: "Region is required." };
  if (ages.length === 0) return { ok: false, error: "Pick at least one age category." };
  if (!organiserUrl) return { ok: false, error: "Organiser URL is required." };
  if (bookingStatus === "open" && !bookingLink) return { ok: false, error: "Booking link is required when entries are open." };

  return {
    ok: true,
    values: {
      title,
      discipline,
      status,
      weekdays,
      start_date: startDate,
      until_date: untilDate,
      venue_name: venueName,
      address,
      postcode,
      region,
      age_categories: ages,
      kids_only: kidsOnly,
      booking_status: bookingStatus,
      booking_link: bookingLink,
      organiser_url: organiserUrl,
      organiser_name: organiserName,
      organiser_contact: organiserContact,
      club_id: clubId,
      description,
    },
  };
}
