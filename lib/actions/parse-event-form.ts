import { ukMidnightUtcIso } from "@/lib/uk-time";
import type {
  AgeCategory,
  BookingStatusType,
  DisciplineType,
  EventRow,
  EventStatus,
  RegionType,
} from "@/lib/supabase/types";

export type EventFormValues = Pick<
  EventRow,
  | "title"
  | "discipline"
  | "status"
  | "all_day"
  | "start_datetime"
  | "end_datetime"
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
>;

// Every event is all-day — there is no time-of-day concept anywhere in this
// app (extraction, display, or editing), so start_datetime is always
// midnight UTC on the given date and end_datetime is always null.
export function parseEventForm(
  formData: FormData
): { ok: false; error: string } | { ok: true; values: EventFormValues } {
  const title = String(formData.get("title") ?? "").trim();
  const discipline = String(formData.get("discipline") ?? "") as DisciplineType;
  const status = String(formData.get("status") ?? "confirmed") as EventStatus;
  const date = String(formData.get("date") ?? "");
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

  if (!title) return { ok: false, error: "Title is required." };
  if (!discipline) return { ok: false, error: "Discipline is required." };
  if (!date) return { ok: false, error: "Date is required." };
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
      all_day: true,
      start_datetime: ukMidnightUtcIso(date),
      end_datetime: null,
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
    },
  };
}
