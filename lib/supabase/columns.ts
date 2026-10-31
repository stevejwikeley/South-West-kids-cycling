import type { EventRow } from "./types";

// The event columns the anonymous role is granted SELECT on (see
// supabase/migrations/0006_security_hardening.sql). Anything that can run
// without a signed-in user must select exactly these — `select("*")` fails
// for anon once the internal columns (created_by, updated_by, source_type,
// source_detail, published_via, field_flags) are no longer granted to it.
export const PUBLIC_EVENT_COLUMNS = [
  "id",
  "title",
  "discipline",
  "status",
  "start_datetime",
  "end_datetime",
  "all_day",
  "venue_name",
  "address",
  "postcode",
  "lat",
  "lng",
  "age_categories",
  "kids_only",
  "booking_status",
  "booking_link",
  "organiser_url",
  "organiser_name",
  "organiser_contact",
  "club_id",
  "region",
  "approved",
  "created_at",
  "updated_at",
] as const satisfies readonly (keyof EventRow)[];

export const PUBLIC_EVENT_SELECT = PUBLIC_EVENT_COLUMNS.join(",");

export type PublicEventRow = Pick<EventRow, (typeof PUBLIC_EVENT_COLUMNS)[number]>;
