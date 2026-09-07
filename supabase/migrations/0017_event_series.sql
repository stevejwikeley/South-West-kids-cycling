-- Recurring events: weekly-only, on a chosen set of weekdays, with a
-- required end date (no open-ended series). event_series holds the
-- recurrence rule + the shared template; events.series_id links generated
-- occurrence rows back to it. Editing an occurrence's own fields detaches
-- it (series_detached = true) so series-level edits/regeneration never
-- touch it again — same semantics as Google Calendar's "this event only".
-- Skipping a date/range is recorded in event_series_exceptions so it
-- survives regeneration if the series is later edited to extend its range.
--
-- until_date is required (no indefinite series), so the full occurrence set
-- is always bounded — occurrences are generated synchronously in one bulk
-- insert at series create/edit time, no background cron job needed.

create table event_series (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  discipline discipline_type not null,
  status event_status not null default 'confirmed',
  weekdays smallint[] not null,      -- ISO weekday numbers: 1=Mon .. 7=Sun
  start_date date not null,          -- floor for generation (first eligible date)
  until_date date not null,          -- inclusive last eligible date, required
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
  approved boolean not null default true,
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint series_booking_link_required_when_open
    check (booking_status <> 'open' or booking_link is not null),
  constraint series_weekdays_valid
    check (weekdays <@ array[1,2,3,4,5,6,7]::smallint[] and array_length(weekdays, 1) > 0),
  constraint series_until_on_or_after_start
    check (until_date >= start_date)
);

create index event_series_created_by_idx on event_series (created_by);

create table event_series_exceptions (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references event_series (id) on delete cascade,
  occurrence_date date not null,
  reason text,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  unique (series_id, occurrence_date)
);

create index event_series_exceptions_series_id_idx on event_series_exceptions (series_id);

alter table events add column series_id uuid references event_series (id) on delete set null;
alter table events add column occurrence_date date;
alter table events add column series_detached boolean not null default false;

alter table events add constraint occurrence_date_requires_series
  check ((series_id is null) = (occurrence_date is null));

create index events_series_id_idx on events (series_id) where series_id is not null;
create unique index events_series_occurrence_unique_idx
  on events (series_id, occurrence_date) where series_id is not null;

create trigger event_series_set_updated_at before update on event_series
  for each row execute function set_updated_at();

alter table event_series enable row level security;
alter table event_series_exceptions enable row level security;

-- ---------- event_series RLS (mirrors events' admin/organiser pattern) ----------

create policy "public can read approved series"
  on event_series for select
  using (approved = true);

create policy "admins can read all series"
  on event_series for select
  using (is_admin());

create policy "organisers can read their own series"
  on event_series for select
  using (auth.uid() = created_by);

create policy "admins can insert series"
  on event_series for insert
  with check (is_admin());

create policy "organisers can insert their own series"
  on event_series for insert
  with check (auth.uid() = created_by and not is_admin());

create policy "admins can update any series"
  on event_series for update
  using (is_admin());

create policy "organisers can update their own series"
  on event_series for update
  using (auth.uid() = created_by)
  with check (auth.uid() = created_by);

create policy "admins can delete any series"
  on event_series for delete
  using (is_admin());

create policy "organisers can delete their own series"
  on event_series for delete
  using (auth.uid() = created_by);

-- ---------- event_series_exceptions RLS ----------
-- Ownership follows the parent series, not the exception row itself.
-- No update policy: exceptions are add/remove only.

create policy "admins can read all series exceptions"
  on event_series_exceptions for select
  using (is_admin());

create policy "organisers can read their own series exceptions"
  on event_series_exceptions for select
  using (exists (select 1 from event_series s where s.id = series_id and s.created_by = auth.uid()));

create policy "admins can insert series exceptions"
  on event_series_exceptions for insert
  with check (is_admin());

create policy "organisers can insert their own series exceptions"
  on event_series_exceptions for insert
  with check (exists (select 1 from event_series s where s.id = series_id and s.created_by = auth.uid() and not is_admin()));

create policy "admins can delete any series exception"
  on event_series_exceptions for delete
  using (is_admin());

create policy "organisers can delete their own series exceptions"
  on event_series_exceptions for delete
  using (exists (select 1 from event_series s where s.id = series_id and s.created_by = auth.uid()));
