-- Security hardening from the October 2026 assessment. Each section names
-- the problem it closes. Safe to run on the live database: existing admin
-- and organiser profiles are untouched.

-- ---------------------------------------------------------------------------
-- 1. Only invited users get a profile, and nobody becomes admin by email.
--
-- Before: every new auth user got an 'organiser' profile, so if Supabase
-- signups were ever switched on, anyone could POST /auth/v1/signup with the
-- public anon key and start publishing straight to the calendar. And the
-- first account created with the owner's email became admin — on a fresh
-- project, preview branch or `db reset`, that could be someone else, before
-- the email was even confirmed.
--
-- After: a profile (always 'organiser') is created only once auth.users has
-- invited_at set, which only the admin invite API does. GoTrue may set
-- invited_at in the INSERT or in a follow-up UPDATE, so the trigger listens
-- for both. Admins are promoted by hand in the SQL editor:
--   update profiles set role = 'admin' where email = '...';
-- Without a profile, events.created_by (FK to profiles) can't point at the
-- user, so a self-registered account can't create events at all.
-- ---------------------------------------------------------------------------

create or replace function handle_new_user() returns trigger as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'organiser'::user_role)
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert or update of invited_at on auth.users
  for each row
  when (new.invited_at is not null)
  execute function handle_new_user();

-- Trigger functions aren't meant to be called directly.
revoke execute on function handle_new_user() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Lock down what the public can put in the pending queue.
--
-- Before: `with check (true)` let anyone insert any shape of row: thousands
-- per request, megabytes of text, created_by pointing at the admin,
-- source_type 'smart_ingest', extraction_confidence 1.0, a reassuring
-- hold_reason, and so on.
--
-- After: the public may only insert a change request for a published event,
-- shaped exactly like the one submitChangeRequest builds, with a size cap.
-- A trigger throttles how many can pile up.
-- ---------------------------------------------------------------------------

drop policy if exists "anyone can submit a pending change" on events_pending;

create policy "public can suggest changes to published events"
  on events_pending for insert
  to anon, authenticated
  with check (
    source_type = 'change_request'
    and duplicate_of is not null
    and exists (select 1 from events e where e.id = duplicate_of and e.approved)
    and diff_against is not null
    and jsonb_typeof(diff_against) = 'object'
    and pg_column_size(diff_against) <= 16384
    and (title is null or length(title) <= 300)
    and created_by is null
    and age_categories = '{}'
    and num_nonnulls(
      discipline, status, start_datetime, end_datetime, venue_name, address,
      postcode, lat, lng, kids_only, booking_status, booking_link,
      organiser_url, organiser_name, organiser_contact, club_id, region,
      source_detail, extraction_confidence, raw_source_ref, hold_reason
    ) = 0
  );

-- approveChange puts a claimed row back if applying it fails; that insert
-- is the admin's and carries whatever the original row had.
create policy "admins can insert into pending queue"
  on events_pending for insert
  to authenticated
  with check (is_admin());

-- Throttle: at most 10 open suggestions per event and 100 per hour overall
-- from the public. Admins (and the service role, which has no auth.uid())
-- are exempt. security definer so it can count rows the caller can't see.
create function throttle_pending_changes() returns trigger as $$
begin
  -- Inside security definer, current_user is the owner, not the caller, so
  -- go by the role in the request's JWT (as auth.role() does). Only
  -- PostgREST requests made with the anon/user keys are throttled; the
  -- service role, migrations and the SQL editor are not.
  if coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '')
     not in ('anon', 'authenticated') then
    return new;
  end if;
  if is_admin() then
    return new;
  end if;

  -- Serialise public inserts so the counts below can't be raced past (one
  -- 10,000-row statement, or many concurrent requests). Cheap at this scale.
  perform pg_advisory_xact_lock(hashtext('events_pending_throttle'));

  if (select count(*) from public.events_pending where duplicate_of = new.duplicate_of) >= 10 then
    raise exception 'Too many suggestions are already waiting for this event — please try again once they''ve been reviewed.'
      using errcode = 'check_violation';
  end if;

  if (select count(*) from public.events_pending
      where created_by is null and created_at > now() - interval '1 hour') >= 100 then
    raise exception 'Too many suggestions right now — please try again later.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

revoke execute on function throttle_pending_changes() from public, anon, authenticated;

create trigger events_pending_throttle
  before insert on events_pending
  for each row execute function throttle_pending_changes();

-- ---------------------------------------------------------------------------
-- 3. Organisers can't forge audit fields.
--
-- Before: an organiser could publish an event marked published_via
-- 'reviewed' / source_type 'smart_ingest', and set updated_by to the
-- admin's id on their own events.
--
-- After: for any signed-in user, created_by/created_at are fixed and
-- updated_by is always the person making the change. For non-admins the
-- provenance columns are pinned too. Service-role writes (no auth.uid())
-- are left alone for future ingest jobs.
-- ---------------------------------------------------------------------------

create function enforce_event_audit_fields() returns trigger as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.updated_by := null;
    if not is_admin() then
      new.source_type := 'manual';
      new.source_detail := null;
      new.published_via := null;
      new.field_flags := null;
    end if;
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.updated_by := auth.uid();
    if not is_admin() then
      new.source_type := old.source_type;
      new.source_detail := old.source_detail;
      new.published_via := old.published_via;
      new.field_flags := old.field_flags;
    end if;
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

revoke execute on function enforce_event_audit_fields() from public, anon, authenticated;

create trigger events_enforce_audit_fields
  before insert or update on events
  for each row execute function enforce_event_audit_fields();

-- ---------------------------------------------------------------------------
-- 4. Least-privilege grants for the anonymous role.
--
-- 0005 granted anon full CRUD on every table and left RLS to sort it out.
-- That held up under testing, but there's no reason for anon to hold
-- privileges no policy uses — and the column-level grant on events stops
-- the internal columns (who created/edited a row, ingest provenance)
-- being readable by anyone with the public key.
-- ---------------------------------------------------------------------------

revoke all on profiles, watched_sources from anon;
revoke insert, update, delete on events, clubs from anon;
revoke select, update, delete on events_pending from anon;

revoke select on events from anon;
grant select (
  id, title, discipline, status, start_datetime, end_datetime, all_day,
  venue_name, address, postcode, lat, lng, age_categories, kids_only,
  booking_status, booking_link, organiser_url, organiser_name,
  organiser_contact, club_id, region, approved, created_at, updated_at
) on events to anon;
-- Keep in sync with PUBLIC_EVENT_COLUMNS in lib/supabase/columns.ts.

-- Note: is_admin() stays executable by anon. Postgres evaluates every
-- applicable RLS policy (including "admins can read all events") with the
-- caller's privileges, so revoking it would break public reads. It only
-- ever answers "is the caller an admin?", which for anon is always false.
