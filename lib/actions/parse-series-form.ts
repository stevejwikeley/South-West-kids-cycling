import type {
  AgeCategory,
  BookingStatusType,
  DisciplineType,
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
>;

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
    },
  };
}
