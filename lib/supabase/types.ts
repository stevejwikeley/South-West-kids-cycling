// Hand-written to match supabase/migrations/0001_init.sql. Once the Supabase
// CLI is linked to the project, this can be regenerated with:
//   supabase gen types typescript --project-id mpbptzacxbxadvwnqdol > lib/supabase/types.ts

export type DisciplineType = "cx" | "xc" | "road" | "tri" | "clusters" | "other";
export type EventStatus = "confirmed" | "provisional" | "cancelled";
export type BookingStatusType = "open" | "planned";
export type RegionType = "devon" | "cornwall" | "both";
export type AgeCategory = "u8" | "u10" | "u12" | "u14" | "u16";
export type SourceTypeEnum = "manual" | "change_request" | "smart_ingest";
export type PublishedViaType = "auto" | "reviewed";
export type UserRole = "admin" | "organiser";
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

export interface EventPendingRow extends Omit<EventRow, "approved" | "published_via" | "updated_by"> {
  extraction_confidence: number | null;
  duplicate_of: string | null;
  raw_source_ref: string | null;
  diff_against: Record<string, unknown> | null;
  hold_reason: string | null;
}

export interface WatchedSourceRow {
  id: string;
  url: string;
  label: string;
  check_frequency: string;
  confidence_weight: number;
  correction_rate: number;
  last_checked_at: string | null;
  last_result_count: number | null;
  last_seen_events: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface ProfileRow {
  id: string;
  email: string;
  role: UserRole;
  created_at: string;
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
      clubs: { Row: AsRecord<ClubRow>; Insert: AsRecord<Partial<ClubRow>>; Update: AsRecord<Partial<ClubRow>>; Relationships: [] };
      events_pending: { Row: AsRecord<EventPendingRow>; Insert: AsRecord<Partial<EventPendingRow>>; Update: AsRecord<Partial<EventPendingRow>>; Relationships: [] };
      watched_sources: { Row: AsRecord<WatchedSourceRow>; Insert: AsRecord<Partial<WatchedSourceRow>>; Update: AsRecord<Partial<WatchedSourceRow>>; Relationships: [] };
      profiles: { Row: AsRecord<ProfileRow>; Insert: AsRecord<Partial<ProfileRow>>; Update: AsRecord<Partial<ProfileRow>>; Relationships: [] };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
}
