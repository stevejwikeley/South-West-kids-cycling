// Hand-written to match supabase/migrations/0001_init.sql. Once the Supabase
// CLI is linked to the project, this can be regenerated with:
//   supabase gen types typescript --project-id mpbptzacxbxadvwnqdol > lib/supabase/types.ts

export type DisciplineType = "cx" | "xc" | "road" | "tri" | "gravel" | "duathlon" | "clusters" | "other";
export type EventStatus = "confirmed" | "provisional" | "cancelled";
export type BookingStatusType = "open" | "planned";
export type RegionType = "devon" | "cornwall" | "somerset" | "both";
export type AgeCategory = "u8" | "u10" | "u12" | "u14" | "u16";
export type SourceTypeEnum = "manual" | "change_request" | "smart_ingest" | "public_submission";
export type PublishedViaType = "auto" | "reviewed";
export type UserRole = "admin" | "organiser" | "super_admin";
export type ClubDiscipline = "road" | "xc" | "cx";

export interface EventRow {
  id: string;
  title: string;
  discipline: DisciplineType;
  status: EventStatus;
  start_datetime: string;
  end_datetime: string | null;
  all_day: boolean;
  venue_name: string;
  address: string | null;
  postcode: string | null;
  lat: number | null;
  lng: number | null;
  age_categories: AgeCategory[];
  kids_only: boolean;
  booking_status: BookingStatusType;
  booking_link: string | null;
  organiser_url: string;
  organiser_name: string | null;
  organiser_contact: string | null;
  club_id: string | null;
  region: RegionType;
  source_type: SourceTypeEnum;
  source_detail: string | null;
  approved: boolean;
  published_via: PublishedViaType | null;
  field_flags: Record<string, unknown> | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  // Set together (both null or both set): occurrence_date is the date this
  // row was generated for, series_id links back to the event_series it
  // belongs to. series_detached means an organiser edited this occurrence
  // directly, so series-level edits/regeneration must never overwrite it.
  series_id: string | null;
  occurrence_date: string | null;
  series_detached: boolean;
  bookable: boolean;
  booking_capacity: number | null;
  description: string | null;
}

// ISO weekday numbers: 1=Mon .. 7=Sun.
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

// Recurrence rule + the shared template every generated occurrence copies
// from. Same field set as EventRow minus per-occurrence specifics (no
// approved/published_via/source_type — occurrences are always
// source_type "manual" and auto-approved, matching the plain manual-create
// path) plus the weekly recurrence fields themselves.
export interface EventSeriesRow {
  id: string;
  title: string;
  discipline: DisciplineType;
  status: EventStatus;
  weekdays: Weekday[];
  start_date: string;
  until_date: string;
  venue_name: string;
  address: string | null;
  postcode: string | null;
  lat: number | null;
  lng: number | null;
  age_categories: AgeCategory[];
  kids_only: boolean;
  booking_status: BookingStatusType;
  booking_link: string | null;
  organiser_url: string;
  organiser_name: string | null;
  organiser_contact: string | null;
  club_id: string | null;
  region: RegionType;
  approved: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  description: string | null;
}

// A skipped occurrence date. Only ever added/removed, never edited.
export interface EventSeriesExceptionRow {
  id: string;
  series_id: string;
  occurrence_date: string;
  reason: string | null;
  created_by: string | null;
  created_at: string;
}

export type SignupStatus = "confirmed" | "waitlisted" | "cancelled";

export interface AttendeeRow {
  id: string;
  email: string;
  contact_name: string | null;
  phone: string | null;
  created_at: string;
}

export interface BookingRow {
  id: string;
  event_id: string;
  attendee_id: string;
  status: SignupStatus;
  created_at: string;
}

export interface BookingPersonRow {
  id: string;
  booking_id: string;
  name: string;
  age_category: AgeCategory;
}

export interface ClubRow {
  id: string;
  name: string;
  location: string;
  lat: number | null;
  lng: number | null;
  website: string | null;
  disciplines: ClubDiscipline[];
  age_note: string | null;
  kids_only: boolean;
  founded: string | null;
  summary: string | null;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
}

// Not Omit<EventRow, ...> — events_pending's columns are almost all
// nullable (extraction may not know a field yet), unlike the live events
// table where most of the same columns are NOT NULL. Mirrors the actual
// schema in supabase/migrations/0001_init.sql rather than borrowing
// EventRow's stricter types.
export interface EventPendingRow {
  id: string;
  title: string | null;
  discipline: DisciplineType | null;
  status: EventStatus | null;
  start_datetime: string | null;
  end_datetime: string | null;
  all_day: boolean;
  venue_name: string | null;
  address: string | null;
  postcode: string | null;
  lat: number | null;
  lng: number | null;
  age_categories: AgeCategory[];
  kids_only: boolean | null;
  booking_status: BookingStatusType | null;
  booking_link: string | null;
  organiser_url: string | null;
  organiser_name: string | null;
  organiser_contact: string | null;
  club_id: string | null;
  region: RegionType | null;
  source_type: SourceTypeEnum;
  source_detail: string | null;
  extraction_confidence: number | null;
  duplicate_of: string | null;
  raw_source_ref: string | null;
  diff_against: Record<string, unknown> | null;
  hold_reason: string | null;
  field_flags: Record<string, string> | null;
  watched_source_id: string | null;
  was_edited: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  bookable: boolean | null;
  booking_capacity: number | null;
  description: string | null;
}

export interface WatchedSourceRow {
  id: string;
  url: string;
  label: string;
  check_frequency: string;
  confidence_weight: number;
  correction_rate: number;
  published_count: number;
  corrected_count: number;
  last_checked_at: string | null;
  last_result_count: number | null;
  last_seen_events: Record<string, unknown> | null;
  last_status: "ok" | "error" | null;
  last_error: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProfileRow {
  id: string;
  email: string;
  role: UserRole;
  created_at: string;
}

export type WillSubscribeType = "yes" | "no" | "already";

export interface SiteFeedbackRow {
  id: string;
  raced_before: boolean | null;
  usefulness: number | null;
  will_subscribe: WillSubscribeType | null;
  message: string | null;
  page_url: string | null;
  email: string | null;
  created_at: string;
}

export interface EmailSubscriberRow {
  id: string;
  email: string;
  unsubscribe_token: string;
  subscribed_at: string;
  unsubscribed_at: string | null;
}

// GenericTable (postgrest-js) requires Row/Insert/Update to structurally
// satisfy Record<string, unknown> — a plain interface without an index
// signature doesn't, even though every field is one, so it silently
// resolves table operations to `never`. Intersecting keeps EventRow etc.
// clean everywhere else while satisfying that structural check here.
type AsRecord<T> = T & Record<string, unknown>;

export interface Database {
  public: {
    Tables: {
      events: { Row: AsRecord<EventRow>; Insert: AsRecord<Partial<EventRow>>; Update: AsRecord<Partial<EventRow>>; Relationships: [] };
      event_series: { Row: AsRecord<EventSeriesRow>; Insert: AsRecord<Partial<EventSeriesRow>>; Update: AsRecord<Partial<EventSeriesRow>>; Relationships: [] };
      event_series_exceptions: { Row: AsRecord<EventSeriesExceptionRow>; Insert: AsRecord<Partial<EventSeriesExceptionRow>>; Update: AsRecord<Partial<EventSeriesExceptionRow>>; Relationships: [] };
      clubs: { Row: AsRecord<ClubRow>; Insert: AsRecord<Partial<ClubRow>>; Update: AsRecord<Partial<ClubRow>>; Relationships: [] };
      events_pending: { Row: AsRecord<EventPendingRow>; Insert: AsRecord<Partial<EventPendingRow>>; Update: AsRecord<Partial<EventPendingRow>>; Relationships: [] };
      watched_sources: { Row: AsRecord<WatchedSourceRow>; Insert: AsRecord<Partial<WatchedSourceRow>>; Update: AsRecord<Partial<WatchedSourceRow>>; Relationships: [] };
      profiles: { Row: AsRecord<ProfileRow>; Insert: AsRecord<Partial<ProfileRow>>; Update: AsRecord<Partial<ProfileRow>>; Relationships: [] };
      site_feedback: { Row: AsRecord<SiteFeedbackRow>; Insert: AsRecord<Partial<SiteFeedbackRow>>; Update: AsRecord<Partial<SiteFeedbackRow>>; Relationships: [] };
      email_subscribers: { Row: AsRecord<EmailSubscriberRow>; Insert: AsRecord<Partial<EmailSubscriberRow>>; Update: AsRecord<Partial<EmailSubscriberRow>>; Relationships: [] };
      attendees: { Row: AsRecord<AttendeeRow>; Insert: AsRecord<Partial<AttendeeRow>>; Update: AsRecord<Partial<AttendeeRow>>; Relationships: [] };
      bookings: { Row: AsRecord<BookingRow>; Insert: AsRecord<Partial<BookingRow>>; Update: AsRecord<Partial<BookingRow>>; Relationships: [] };
      booking_people: { Row: AsRecord<BookingPersonRow>; Insert: AsRecord<Partial<BookingPersonRow>>; Update: AsRecord<Partial<BookingPersonRow>>; Relationships: [] };
    };
    Views: Record<string, never>;
    Functions: {
      create_booking: {
        Args: { p_event_id: string; p_attendee_id: string; p_people: { name: string; age_category: AgeCategory }[] };
        Returns: { booking_id: string; status: string }[];
      };
      cancel_booking: {
        Args: { p_booking_id: string };
        Returns: { cancelled_event_id: string; promoted_booking_id: string | null; promoted_attendee_id: string | null }[];
      };
      event_spaces_left: {
        Args: { p_event_id: string };
        Returns: number | null;
      };
    };
  };
}
