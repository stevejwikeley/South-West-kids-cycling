-- supabase/migrations/0018_event_booking.sql
-- Lightweight booking system for free events (see
-- docs/superpowers/specs/2026-09-07-event-booking-design.md). Attendees are
-- a separate identity from profiles (admin/organiser) even though both are
-- Supabase Auth users under the hood — handle_new_user() must branch on the
-- invited role in raw_user_meta_data, otherwise a parent signing in via
-- magic link would silently fall into the trigger's existing "no role
-- metadata -> organiser" default and get organiser dashboard access.

alter table events add column bookable boolean not null default false;
alter table events add column booking_capacity integer;
alter table events add constraint booking_capacity_positive
  check (booking_capacity is null or booking_capacity > 0);

-- ---------- attendees ----------
-- One row per parent/guardian account, keyed by their Supabase Auth user id
-- (not profiles — admin/organiser and attendee are different trust levels
-- and shouldn't share a table or RLS policy set). contact_name/phone are
-- nullable because handle_new_user() below only knows id+email at the
-- moment the auth user is created; the booking action fills them in
-- immediately after via an explicit update.
create table attendees (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  contact_name text,
  phone text,
  created_at timestamptz not null default now()
);

alter table attendees enable row level security;

create policy "attendees can read their own row"
  on attendees for select
  using (auth.uid() = id);

create policy "admins can read all attendees"
  on attendees for select
  using (is_admin());

create policy "organisers can read attendees who booked their events"
  on attendees for select
  using (exists (
    select 1 from bookings
    join events on events.id = bookings.event_id
    where bookings.attendee_id = attendees.id and events.created_by = auth.uid()
  ));

-- ---------- bookings ----------
-- One row per family's signup for one event. signup_status is a distinct
-- type from the existing booking_status_type (events.booking_status,
-- open/planned — an unrelated concept) to avoid confusion between the two.
create type signup_status as enum ('confirmed', 'waitlisted', 'cancelled');

create table bookings (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events (id) on delete cascade,
  attendee_id uuid not null references attendees (id) on delete cascade,
  status signup_status not null,
  created_at timestamptz not null default now()
);

create index bookings_event_id_idx on bookings (event_id);
create index bookings_attendee_id_idx on bookings (attendee_id);

alter table bookings enable row level security;

create policy "attendees can read their own bookings"
  on bookings for select
  using (auth.uid() = attendee_id);

create policy "admins can read all bookings"
  on bookings for select
  using (is_admin());

create policy "organisers can read bookings for their own events"
  on bookings for select
  using (exists (select 1 from events where events.id = bookings.event_id and events.created_by = auth.uid()));

-- No insert/update policies here at all: every write to bookings goes
-- through create_booking()/cancel_booking() below, called via the
-- service-role client or as security definer — never a direct table write
-- from a user session.

-- ---------- booking_people ----------
-- One row per person on a booking (the parent's children). age_category
-- reuses the existing enum from 0001_init.sql.
create table booking_people (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings (id) on delete cascade,
  name text not null,
  age_category age_category not null
);

create index booking_people_booking_id_idx on booking_people (booking_id);

alter table booking_people enable row level security;

create policy "attendees can read their own booking people"
  on booking_people for select
  using (exists (
    select 1 from bookings where bookings.id = booking_people.booking_id and bookings.attendee_id = auth.uid()
  ));

create policy "admins can read all booking people"
  on booking_people for select
  using (is_admin());

create policy "organisers can read booking people for their own events"
  on booking_people for select
  using (exists (
    select 1 from bookings
    join events on events.id = bookings.event_id
    where bookings.id = booking_people.booking_id and events.created_by = auth.uid()
  ));

-- ---------- handle_new_user(): route attendee signups away from profiles ----------
create or replace function handle_new_user() returns trigger as $$
declare
  invited_role text := new.raw_user_meta_data->>'role';
begin
  if invited_role = 'attendee' then
    insert into public.attendees (id, email) values (new.id, new.email);
    return new;
  end if;

  insert into public.profiles (id, email, role)
  values (
    new.id,
    new.email,
    case
      when new.email = 'stevejwikeley@gmail.com' then 'super_admin'
      when invited_role in ('admin', 'organiser') then invited_role::user_role
      else 'organiser'
    end
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- event_spaces_left(): public capacity read without exposing rows ----------
-- No SELECT policy grants public/anon read access to bookings or
-- booking_people (they hold contact details) — the public event page only
-- ever needs a count, so this security definer function returns just that,
-- bypassing RLS internally rather than widening the tables' own policies.
create or replace function event_spaces_left(p_event_id uuid)
returns integer as $$
declare
  v_capacity integer;
  v_confirmed_count integer;
begin
  select booking_capacity into v_capacity from events where id = p_event_id;
  if v_capacity is null then
    return null;
  end if;

  select count(*) into v_confirmed_count
    from bookings b
    join booking_people bp on bp.booking_id = b.id
    where b.event_id = p_event_id and b.status = 'confirmed';

  return greatest(v_capacity - v_confirmed_count, 0);
end;
$$ language plpgsql stable security definer set search_path = public;

grant execute on function event_spaces_left(uuid) to anon, authenticated;

-- ---------- create_booking(): atomic capacity check + insert ----------
-- Only ever called from the createBooking Server Action via the
-- service-role client (it needs the admin API to create the attendee's
-- auth user first, which can't be done from SQL) — never from a user
-- session, so execute is revoked from anon/authenticated below. The
-- advisory lock serializes concurrent calls for the same event so two
-- simultaneous signups can't both see "1 space left" and both claim it.
create or replace function create_booking(
  p_event_id uuid,
  p_attendee_id uuid,
  p_people jsonb
) returns table (booking_id uuid, status text) as $$
declare
  v_capacity integer;
  v_confirmed_count integer;
  v_people_count integer;
  v_status signup_status;
  v_booking_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext(p_event_id::text));

  v_people_count := jsonb_array_length(p_people);
  if v_people_count = 0 then
    raise exception 'At least one person is required.';
  end if;

  select booking_capacity into v_capacity from events where id = p_event_id;

  select count(*) into v_confirmed_count
    from bookings b
    join booking_people bp on bp.booking_id = b.id
    where b.event_id = p_event_id and b.status = 'confirmed';

  if v_capacity is null or v_confirmed_count + v_people_count <= v_capacity then
    v_status := 'confirmed';
  else
    v_status := 'waitlisted';
  end if;

  insert into bookings (event_id, attendee_id, status)
  values (p_event_id, p_attendee_id, v_status)
  returning id into v_booking_id;

  insert into booking_people (booking_id, name, age_category)
  select v_booking_id, p->>'name', (p->>'age_category')::age_category
  from jsonb_array_elements(p_people) as p;

  return query select v_booking_id, v_status::text;
end;
$$ language plpgsql set search_path = public;

revoke execute on function create_booking(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function create_booking(uuid, uuid, jsonb) to service_role;

-- ---------- cancel_booking(): self-service cancel + waitlist promotion ----------
-- security definer because promoting a waitlisted booking updates a row
-- that belongs to a *different* attendee than the one cancelling — a plain
-- RLS-bound update from the caller's own session couldn't do that. The
-- auth.uid() check below is what keeps this safe to expose to any signed-in
-- attendee (same pattern as is_admin() in 0002_auth.sql): a security
-- definer function bypasses RLS entirely, so it must check identity itself.
create or replace function cancel_booking(p_booking_id uuid)
returns table (
  cancelled_event_id uuid,
  promoted_booking_id uuid,
  promoted_attendee_id uuid
) as $$
declare
  v_event_id uuid;
  v_attendee_id uuid;
  v_prev_status signup_status;
  v_capacity integer;
  v_confirmed_count integer;
  v_freed integer;
  v_candidate record;
  v_promoted_booking_id uuid;
  v_promoted_attendee_id uuid;
begin
  select event_id, attendee_id, status into v_event_id, v_attendee_id, v_prev_status
    from bookings where id = p_booking_id;

  if v_event_id is null then
    raise exception 'Booking not found.';
  end if;
  if v_attendee_id <> auth.uid() then
    raise exception 'Not authorised to cancel this booking.';
  end if;

  if v_prev_status = 'cancelled' then
    return query select v_event_id, null::uuid, null::uuid;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtext(v_event_id::text));

  update bookings set status = 'cancelled' where id = p_booking_id;

  if v_prev_status = 'confirmed' then
    select booking_capacity into v_capacity from events where id = v_event_id;

    if v_capacity is not null then
      select count(*) into v_confirmed_count
        from bookings b
        join booking_people bp on bp.booking_id = b.id
        where b.event_id = v_event_id and b.status = 'confirmed';
      v_freed := v_capacity - v_confirmed_count;

      for v_candidate in
        select b.id as booking_id, b.attendee_id, count(bp.id) as people_count
        from bookings b
        join booking_people bp on bp.booking_id = b.id
        where b.event_id = v_event_id and b.status = 'waitlisted'
        group by b.id, b.attendee_id, b.created_at
        order by b.created_at asc
      loop
        if v_candidate.people_count <= v_freed then
          update bookings set status = 'confirmed' where id = v_candidate.booking_id;
          v_promoted_booking_id := v_candidate.booking_id;
          v_promoted_attendee_id := v_candidate.attendee_id;
          exit;
        end if;
      end loop;
    end if;
  end if;

  return query select v_event_id, v_promoted_booking_id, v_promoted_attendee_id;
end;
$$ language plpgsql security definer set search_path = public;

revoke execute on function cancel_booking(uuid) from public, anon;
grant execute on function cancel_booking(uuid) to authenticated;
