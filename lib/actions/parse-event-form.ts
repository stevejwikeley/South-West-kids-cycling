import { ukMidnightUtcIso } from "@/lib/uk-time";
import type {
  AgeCategory,
  BookingStatusType,
  DisciplineType,
  EventKind,
  EventRow,
  EventStatus,
  RegionType,
} from "@/lib/supabase/types";

export type EventFormValues = Pick<
  EventRow,
  | "title"
  | "discipline"
  | "status"
  | "kind"
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
  | "bookable"
  | "booking_capacity"
  | "club_id"
  | "description"
>;

// Every event is all-day — there is no time-of-day concept anywhere in this
// app (extraction, display, or editing), so start_datetime is always
// midnight UTC on the given date and end_datetime is always null.
export function parseEventForm(
  formData: FormData,
  // Defaults to enforcing the same rule as the training_requires_club
  // DB constraint. public-submit.ts's structured form passes false: a member
  // of the public has no club_id field to fill in (it's an internal id), and
  // their submission lands in events_pending — which, like the rest of the
  // pending queue, is deliberately unconstrained — not straight into events.
  options: { requireClubForTraining?: boolean } = {}
): { ok: false; error: string } | { ok: true; values: EventFormValues } {
  const { requireClubForTraining = true } = options;
  const title = String(formData.get("title") ?? "").trim();
  const discipline = String(formData.get("discipline") ?? "") as DisciplineType;
  const status = String(formData.get("status") ?? "confirmed") as EventStatus;
  const kind = (String(formData.get("kind") ?? "race") === "training" ? "training" : "race") as EventKind;
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
  const clubId = String(formData.get("club_id") ?? "").trim() || null;
  const description = String(formData.get("description") ?? "").trim() || null;

  const bookable = formData.get("bookable") === "on";
  const bookingCapacityRaw = String(formData.get("booking_capacity") ?? "").trim();
  const bookingCapacity = bookingCapacityRaw ? Number(bookingCapacityRaw) : null;
  if (bookable && bookingCapacityRaw && (!Number.isInteger(bookingCapacity) || bookingCapacity! <= 0)) {
    return { ok: false, error: "Space limit must be a whole number greater than zero, or left blank for unlimited." };
  }

  if (!title) return { ok: false, error: "Title is required." };
  if (!discipline) return { ok: false, error: "Discipline is required." };
  if (!date) return { ok: false, error: "Date is required." };
  if (!venueName) return { ok: false, error: "Venue is required." };
  if (!region) return { ok: false, error: "Region is required." };
  if (ages.length === 0) return { ok: false, error: "Pick at least one age category." };
  if (!organiserUrl) return { ok: false, error: "Organiser URL is required." };
  if (bookingStatus === "open" && !bookingLink) return { ok: false, error: "Booking link is required when entries are open." };

  // Mirrors the training_requires_club DB constraint, so the form
  // shows a sentence rather than a Postgres error.
  if (requireClubForTraining && kind === "training" && !clubId) {
    return { ok: false, error: "Pick the club that runs this training session." };
  }

  return {
    ok: true,
    values: {
      title,
      discipline,
      status,
      kind,
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
      bookable,
      booking_capacity: bookingCapacity,
      club_id: clubId,
      description,
    },
  };
}
