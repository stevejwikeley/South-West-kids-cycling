import { ukLocalToUtcIso, ukMidnightUtcIso } from "@/lib/uk-time";
import { httpUrlOrNull } from "@/lib/safe-url";
import type {
  AgeCategory,
  BookingStatusType,
  DisciplineType,
  EventRow,
  EventStatus,
  RegionType,
} from "@/lib/supabase/types";

// The only event columns a form (or an approved change request) may write.
// approveChange uses this as an allowlist, so a pending row inserted straight
// through the API can't smuggle in approved/created_by/etc.
export const EVENT_FORM_FIELDS = [
  "title",
  "discipline",
  "status",
  "all_day",
  "start_datetime",
  "end_datetime",
  "venue_name",
  "address",
  "postcode",
  "region",
  "age_categories",
  "kids_only",
  "booking_status",
  "booking_link",
  "organiser_url",
  "organiser_name",
  "organiser_contact",
] as const satisfies readonly (keyof EventRow)[];

export type EventFormValues = Pick<EventRow, (typeof EVENT_FORM_FIELDS)[number]>;

// Generous for real data, small enough that a scripted POST can't stuff
// megabytes into a row (or into a pending change request's diff).
export const MAX_TEXT_LENGTH = 300;
export const MAX_URL_LENGTH = 2000;

const ENUMS = {
  discipline: ["cx", "xc", "road", "tri", "clusters", "other"],
  status: ["confirmed", "provisional", "cancelled"],
  region: ["devon", "cornwall", "both"],
  booking_status: ["open", "planned"],
  ages: ["u8", "u10", "u12", "u14", "u16"],
} as const;

export function parseEventForm(
  formData: FormData
): { ok: false; error: string } | { ok: true; values: EventFormValues } {
  const title = String(formData.get("title") ?? "").trim();
  const discipline = String(formData.get("discipline") ?? "") as DisciplineType;
  const status = String(formData.get("status") ?? "confirmed") as EventStatus;
  const date = String(formData.get("date") ?? "");
  const allDay = formData.get("all_day") === "on";
  const startTime = String(formData.get("start_time") ?? "");
  const endTime = String(formData.get("end_time") ?? "");
  const venueName = String(formData.get("venue_name") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim() || null;
  const postcode = String(formData.get("postcode") ?? "").trim() || null;
  const region = String(formData.get("region") ?? "") as RegionType;
  const ages = formData.getAll("ages").map(String) as AgeCategory[];
  const kidsOnly = formData.get("kids_only") === "on";
  const bookingStatus = String(formData.get("booking_status") ?? "planned") as BookingStatusType;
  const bookingLinkRaw = String(formData.get("booking_link") ?? "").trim();
  const organiserUrlRaw = String(formData.get("organiser_url") ?? "").trim();
  const organiserName = String(formData.get("organiser_name") ?? "").trim() || null;
  const organiserContact = String(formData.get("organiser_contact") ?? "").trim() || null;

  if (!title) return { ok: false, error: "Title is required." };
  if (!discipline) return { ok: false, error: "Discipline is required." };
  if (!date) return { ok: false, error: "Date is required." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) return { ok: false, error: "Date isn't valid." };
  if ([startTime, endTime].some((t) => t && !/^\d{2}:\d{2}$/.test(t))) return { ok: false, error: "Time isn't valid." };
  if (!venueName) return { ok: false, error: "Venue is required." };
  if (!region) return { ok: false, error: "Region is required." };
  if (ages.length === 0) return { ok: false, error: "Pick at least one age category." };
  if (!organiserUrlRaw) return { ok: false, error: "Organiser URL is required." };

  const tooLong = (
    [
      ["Title", title],
      ["Venue", venueName],
      ["Address", address],
      ["Postcode", postcode],
      ["Organiser name", organiserName],
      ["Organiser contact", organiserContact],
    ] as const
  ).find(([, v]) => v && v.length > MAX_TEXT_LENGTH);
  if (tooLong) return { ok: false, error: `${tooLong[0]} is too long (max ${MAX_TEXT_LENGTH} characters).` };
  if (bookingLinkRaw.length > MAX_URL_LENGTH || organiserUrlRaw.length > MAX_URL_LENGTH) {
    return { ok: false, error: "That link is too long." };
  }

  if (!(ENUMS.discipline as readonly string[]).includes(discipline)) return { ok: false, error: "Unknown discipline." };
  if (!(ENUMS.status as readonly string[]).includes(status)) return { ok: false, error: "Unknown status." };
  if (!(ENUMS.region as readonly string[]).includes(region)) return { ok: false, error: "Unknown region." };
  if (!(ENUMS.booking_status as readonly string[]).includes(bookingStatus)) return { ok: false, error: "Unknown booking status." };
  if (ages.some((a) => !(ENUMS.ages as readonly string[]).includes(a))) return { ok: false, error: "Unknown age category." };

  const organiserUrl = httpUrlOrNull(organiserUrlRaw);
  if (!organiserUrl) return { ok: false, error: "Organiser URL must be a web address (https://…)." };
  const bookingLink = bookingLinkRaw ? httpUrlOrNull(bookingLinkRaw) : null;
  if (bookingLinkRaw && !bookingLink) return { ok: false, error: "Booking link must be a web address (https://…)." };
  if (bookingStatus === "open" && !bookingLink) return { ok: false, error: "Booking link is required when entries are open." };
  if (!allDay && !startTime) return { ok: false, error: "Start time is required for a timed event." };

  const start_datetime = allDay ? ukMidnightUtcIso(date) : ukLocalToUtcIso(date, startTime);
  const end_datetime = !allDay && endTime ? ukLocalToUtcIso(date, endTime) : null;

  return {
    ok: true,
    values: {
      title,
      discipline,
      status,
      all_day: allDay,
      start_datetime,
      end_datetime,
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
