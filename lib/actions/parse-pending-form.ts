import { ukLocalToUtcIso, ukMidnightUtcIso } from "@/lib/uk-time";
import type {
  AgeCategory,
  BookingStatusType,
  DisciplineType,
  EventStatus,
  RegionType,
} from "@/lib/supabase/types";

// Same field set as EventFormValues, but every field is optional/nullable —
// a pending row (change_request or smart_ingest) is routinely incomplete,
// and the edit panel needs to save a partial draft without the live-event
// form's "required" validation getting in the way.
export interface PendingFormValues {
  title: string | null;
  discipline: DisciplineType | null;
  status: EventStatus | null;
  all_day: boolean;
  start_datetime: string | null;
  end_datetime: string | null;
  venue_name: string | null;
  address: string | null;
  postcode: string | null;
  region: RegionType | null;
  age_categories: AgeCategory[];
  kids_only: boolean;
  booking_status: BookingStatusType | null;
  booking_link: string | null;
  organiser_url: string | null;
  organiser_name: string | null;
  organiser_contact: string | null;
}

export function parsePendingForm(formData: FormData): PendingFormValues {
  const title = String(formData.get("title") ?? "").trim() || null;
  const discipline = (String(formData.get("discipline") ?? "").trim() || null) as DisciplineType | null;
  const status = (String(formData.get("status") ?? "").trim() || null) as EventStatus | null;
  const date = String(formData.get("date") ?? "").trim();
  const allDay = formData.get("all_day") === "on";
  const startTime = String(formData.get("start_time") ?? "").trim();
  const endTime = String(formData.get("end_time") ?? "").trim();
  const venueName = String(formData.get("venue_name") ?? "").trim() || null;
  const address = String(formData.get("address") ?? "").trim() || null;
  const postcode = String(formData.get("postcode") ?? "").trim() || null;
  const region = (String(formData.get("region") ?? "").trim() || null) as RegionType | null;
  const ages = formData.getAll("ages").map(String) as AgeCategory[];
  const kidsOnly = formData.get("kids_only") === "on";
  const bookingStatus = (String(formData.get("booking_status") ?? "").trim() || null) as BookingStatusType | null;
  const bookingLink = String(formData.get("booking_link") ?? "").trim() || null;
  const organiserUrl = String(formData.get("organiser_url") ?? "").trim() || null;
  const organiserName = String(formData.get("organiser_name") ?? "").trim() || null;
  const organiserContact = String(formData.get("organiser_contact") ?? "").trim() || null;

  let start_datetime: string | null = null;
  if (date) {
    start_datetime = allDay || !startTime ? ukMidnightUtcIso(date) : ukLocalToUtcIso(date, startTime);
  }
  const end_datetime = date && !allDay && endTime ? ukLocalToUtcIso(date, endTime) : null;

  return {
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
  };
}
