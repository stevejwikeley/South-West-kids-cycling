-- South West Kids Cycling — initial schema
-- Covers spec section 5 (data model), scoped for Phase 1: events, clubs,
-- events_pending and watched_sources all created now per section 12 ("schema
-- including watched_sources and clubs from the start"), even though the
-- pending-queue and watched-source features themselves land in later phases.

create extension if not exists "pgcrypto";

-- ---------- enums ----------

create type discipline_type as enum ('cx', 'xc', 'road', 'tri', 'clusters', 'other');
create type event_status as enum ('confirmed', 'provisional', 'cancelled');
create type booking_status_type as enum ('open', 'planned');
create type region_type as enum ('devon', 'cornwall', 'both');
create type age_category as enum ('u8', 'u10', 'u12', 'u14', 'u16');
create type source_type_enum as enum ('manual', 'change_request', 'smart_ingest');
create type published_via_type as enum ('auto', 'reviewed');
create type user_role as enum ('admin', 'organiser');

-- club disciplines follow the mockup's 3-way split (Road / XC-MTB / Cyclocross),
-- not the spec's original 5-way list — the UI only ever renders these three,
-- so a 5-value enum would carry data the front end can't show (see section 8c).
create type club_discipline as enum ('road', 'xc', 'cx');

-- ---------- profiles (admin / organiser roles) ----------

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  role user_role not null default 'organiser',
  created_at timestamptz not null default now()
);

-- ---------- clubs ----------

create table clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  location text not null,
  lat double precision,
  lng double precision,
  website text,
  disciplines club_discipline[] not null default '{}',
  age_note text,
  kids_only boolean not null default false,
  founded text,
  summary text,
  verified_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- events ----------

create table events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  discipline discipline_type not null,
  status event_status not null default 'confirmed',
  start_datetime timestamptz not null,
  end_datetime timestamptz,
  all_day boolean not null default true,
  venue_name text not null,
  address text,
  postcode text,
  lat double precision,
  lng double precision,
  age_categories age_category[] not null default '{}',
  kids_only boolean not null default false,
  booking_status booking_status_type not null default 'planned',
  booking_link text,
  organiser_url text not null,
  organiser_name text,
  organiser_contact text,
  club_id uuid references clubs (id) on delete set null,
  region region_type not null,
  source_type source_type_enum not null default 'manual',
  source_detail text,
  approved boolean not null default false,
  published_via published_via_type,
  field_flags jsonb,
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint booking_link_required_when_open
    check (booking_status <> 'open' or booking_link is not null)
);

create index events_start_datetime_idx on events (start_datetime);
create index events_approved_idx on events (approved) where approved;

-- ---------- events_pending ----------
-- Same shape as events, plus the gating/confidence fields from section 5.

create table events_pending (
  id uuid primary key default gen_random_uuid(),
  title text,
  discipline discipline_type,
  status event_status,
  start_datetime timestamptz,
  end_datetime timestamptz,
  all_day boolean not null default true,
  venue_name text,
  address text,
  postcode text,
  lat double precision,
  lng double precision,
  age_categories age_category[] not null default '{}',
  kids_only boolean,
  booking_status booking_status_type,
  booking_link text,
  organiser_url text,
  organiser_name text,
  organiser_contact text,
  club_id uuid references clubs (id) on delete set null,
  region region_type,
  source_type source_type_enum not null default 'change_request',
  source_detail text,
  extraction_confidence numeric,
  duplicate_of uuid references events (id) on delete set null,
  raw_source_ref text,
  diff_against jsonb,
  hold_reason text,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- watched_sources ----------

create table watched_sources (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  label text not null,
  check_frequency text not null default 'nightly',
  confidence_weight numeric not null default 0.3,
  correction_rate numeric not null default 0,
  last_checked_at timestamptz,
  last_result_count integer,
  last_seen_events jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- updated_at triggers ----------

create function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger clubs_set_updated_at before update on clubs
  for each row execute function set_updated_at();
create trigger events_set_updated_at before update on events
  for each row execute function set_updated_at();
create trigger events_pending_set_updated_at before update on events_pending
  for each row execute function set_updated_at();
create trigger watched_sources_set_updated_at before update on watched_sources
  for each row execute function set_updated_at();

-- ---------- row level security ----------
-- Phase 1 posture: public can read approved events and all clubs. Writes are
-- locked down to service_role until auth roles land (task 6), at which point
-- admin/organiser insert-update-delete policies get added here.

alter table profiles enable row level security;
alter table clubs enable row level security;
alter table events enable row level security;
alter table events_pending enable row level security;
alter table watched_sources enable row level security;

create policy "public can read approved events"
  on events for select
  using (approved = true);

create policy "public can read clubs"
  on clubs for select
  using (true);

create policy "users can read their own profile"
  on profiles for select
  using (auth.uid() = id);
