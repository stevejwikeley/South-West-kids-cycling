-- Throwaway verification script, NOT a real migration (not numbered/applied
-- automatically, not listed in README.md's migration table). Paste this
-- into the Supabase Dashboard SQL editor after applying 0018_event_booking.sql
-- to sanity-check create_booking()/cancel_booking()/event_spaces_left()
-- before relying on them. It creates two temporary attendees and one
-- temporary event, exercises the functions, and deletes everything it
-- created.

do $$
declare
  v_event_id uuid;
  v_attendee_a uuid := gen_random_uuid();
  v_attendee_b uuid := gen_random_uuid();
  v_booking_a uuid;
  v_booking_b uuid;
  v_status_a text;
  v_status_b text;
  v_spaces_before integer;
  v_spaces_after integer;
begin
  insert into auth.users (id, email) values (v_attendee_a, 'scratch-a@example.com');
  insert into auth.users (id, email) values (v_attendee_b, 'scratch-b@example.com');
  insert into attendees (id, email, contact_name) values (v_attendee_a, 'scratch-a@example.com', 'Scratch A');
  insert into attendees (id, email, contact_name) values (v_attendee_b, 'scratch-b@example.com', 'Scratch B');

  insert into events (title, discipline, start_datetime, venue_name, organiser_url, region, approved, bookable, booking_capacity)
  values ('SCRATCH TEST EVENT', 'cx', now() + interval '7 days', 'Test venue', 'https://example.com', 'devon', true, true, 1)
  returning id into v_event_id;

  select event_spaces_left(v_event_id) into v_spaces_before;
  assert v_spaces_before = 1, 'expected 1 space before any booking';

  select booking_id, status into v_booking_a, v_status_a
    from create_booking(v_event_id, v_attendee_a, '[{"name":"Kid A","age_category":"u10"}]'::jsonb);
  assert v_status_a = 'confirmed', 'first booking (1 person, capacity 1) should confirm';

  select booking_id, status into v_booking_b, v_status_b
    from create_booking(v_event_id, v_attendee_b, '[{"name":"Kid B1","age_category":"u10"},{"name":"Kid B2","age_category":"u12"}]'::jsonb);
  assert v_status_b = 'waitlisted', 'second booking (event already full) should waitlist';

  select event_spaces_left(v_event_id) into v_spaces_after;
  assert v_spaces_after = 0, 'expected 0 spaces once confirmed booking fills capacity';

  -- Simulate cancel_booking's auth.uid() check by calling the same logic
  -- directly (auth.uid() is null outside a real request context, so call
  -- the underlying update path this way instead of via the function itself
  -- for this scratch check):
  update bookings set status = 'cancelled' where id = v_booking_a;
  assert (select count(*) from bookings b join booking_people bp on bp.booking_id = b.id where b.event_id = v_event_id and b.status = 'confirmed') = 0,
    'cancelling the only confirmed booking should leave 0 confirmed people';

  raise notice 'create_booking / event_spaces_left checks passed.';

  delete from events where id = v_event_id;
  delete from attendees where id in (v_attendee_a, v_attendee_b);
  delete from auth.users where id in (v_attendee_a, v_attendee_b);
end $$;
