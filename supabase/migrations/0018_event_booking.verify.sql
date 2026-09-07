-- Throwaway verification script, NOT a real migration (not numbered/applied
-- automatically, not listed in README.md's migration table). Paste this
-- into the Supabase Dashboard SQL editor after applying 0018_event_booking.sql
-- to sanity-check create_booking()/cancel_booking()/event_spaces_left()
-- before relying on them. Covers a capacity-1 event (confirm/waitlist,
-- then real cancel_booking() promotion + its auth.uid() ownership check)
-- and a null-capacity ("always fits") event. Creates temporary attendees
-- and events, exercises the functions, and deletes everything it created.

do $$
declare
  v_event_id uuid;
  v_event_id_open uuid;
  v_attendee_a uuid := gen_random_uuid();
  v_attendee_b uuid := gen_random_uuid();
  v_booking_a uuid;
  v_booking_b uuid;
  v_booking_c uuid;
  v_booking_d uuid;
  v_status_a text;
  v_status_b text;
  v_status_c text;
  v_status_d text;
  v_spaces_before integer;
  v_spaces_after integer;
  v_spaces_final integer;
  v_spaces_open_before integer;
  v_spaces_open_after integer;
  v_cancel_event_id uuid;
  v_promoted_booking_id uuid;
  v_promoted_attendee_id uuid;
  v_caught boolean;
begin
  -- raw_user_meta_data with role: 'attendee' is required here so the
  -- auth.users insert actually fires handle_new_user()'s attendee-routing
  -- branch (rather than its organiser-default branch) — that branch is what
  -- keeps a booking parent from ending up with a profiles/organiser row, and
  -- nothing else in this script or the app's automated tests exercises it.
  -- The trigger creates the matching attendees rows itself, so no manual
  -- insert into attendees is needed (or wanted) here.
  insert into auth.users (id, email, raw_user_meta_data) values (v_attendee_a, 'scratch-a@example.com', '{"role":"attendee"}'::jsonb);
  insert into auth.users (id, email, raw_user_meta_data) values (v_attendee_b, 'scratch-b@example.com', '{"role":"attendee"}'::jsonb);

  -- ---------- Scenario 1: capacity 1 - confirm/waitlist, then real cancel_booking() ----------
  insert into events (title, discipline, start_datetime, venue_name, organiser_url, region, approved, bookable, booking_capacity)
  values ('SCRATCH TEST EVENT', 'cx', now() + interval '7 days', 'Test venue', 'https://example.com', 'devon', true, true, 1)
  returning id into v_event_id;

  select event_spaces_left(v_event_id) into v_spaces_before;
  assert v_spaces_before = 1, 'expected 1 space before any booking';

  select booking_id, status into v_booking_a, v_status_a
    from create_booking(v_event_id, v_attendee_a, '[{"name":"Kid A","age_category":"u10"}]'::jsonb);
  assert v_status_a = 'confirmed', 'first booking (1 person, capacity 1) should confirm';

  -- 1-person booking, not 2, so cancelling A frees exactly enough room for
  -- an unambiguous promotion below (a 2-person waitlisted booking wouldn't
  -- fit into the single space freed by cancelling A's 1-person booking).
  select booking_id, status into v_booking_b, v_status_b
    from create_booking(v_event_id, v_attendee_b, '[{"name":"Kid B1","age_category":"u10"}]'::jsonb);
  assert v_status_b = 'waitlisted', 'second booking (event already full) should waitlist';

  select event_spaces_left(v_event_id) into v_spaces_after;
  assert v_spaces_after = 0, 'expected 0 spaces once confirmed booking fills capacity';

  -- Negative case: attendee B is not the owner of booking A, so cancelling
  -- it as B must raise "Not authorised", not succeed. Fake auth.uid() the
  -- same way PostgREST does (request.jwt.claims -> sub), scoped to this
  -- transaction via set_config's third argument.
  perform set_config('request.jwt.claims', json_build_object('sub', v_attendee_b::text)::text, true);
  v_caught := false;
  begin
    perform 1 from cancel_booking(v_booking_a);
    assert false, 'attendee B should not be able to cancel attendee A''s booking';
  exception
    when others then
      v_caught := true;
      assert sqlerrm ilike '%not authoris%', 'expected a "Not authorised" error, got: ' || sqlerrm;
  end;
  assert v_caught, 'expected cancel_booking to raise for a non-owner';

  -- Positive case: attendee A cancelling their own confirmed booking via
  -- the real cancel_booking() RPC (not a raw UPDATE) should succeed, run
  -- its advisory-locked waitlist promotion, and promote B's 1-person
  -- waitlisted booking since it exactly fits the freed space.
  perform set_config('request.jwt.claims', json_build_object('sub', v_attendee_a::text)::text, true);
  select cancelled_event_id, promoted_booking_id, promoted_attendee_id
    into v_cancel_event_id, v_promoted_booking_id, v_promoted_attendee_id
    from cancel_booking(v_booking_a);

  assert v_cancel_event_id = v_event_id, 'cancel_booking should report the correct event id';
  assert v_promoted_booking_id = v_booking_b, 'cancelling A should promote B''s waitlisted booking';
  assert v_promoted_attendee_id = v_attendee_b, 'promoted attendee should be B';

  assert (select status from bookings where id = v_booking_a) = 'cancelled',
    'booking A should be cancelled in the table';
  assert (select status from bookings where id = v_booking_b) = 'confirmed',
    'booking B should be promoted to confirmed in the table';

  select event_spaces_left(v_event_id) into v_spaces_final;
  assert v_spaces_final = 0, 'expected 0 spaces after promotion re-fills capacity';

  -- ---------- Scenario 2: booking_capacity = null ("always fits") ----------
  insert into events (title, discipline, start_datetime, venue_name, organiser_url, region, approved, bookable, booking_capacity)
  values ('SCRATCH TEST EVENT (OPEN CAPACITY)', 'cx', now() + interval '7 days', 'Test venue', 'https://example.com', 'devon', true, true, null)
  returning id into v_event_id_open;

  select event_spaces_left(v_event_id_open) into v_spaces_open_before;
  assert v_spaces_open_before is null, 'event_spaces_left should be null for a null-capacity event';

  select booking_id, status into v_booking_c, v_status_c
    from create_booking(v_event_id_open, v_attendee_a,
      '[{"name":"Kid C1","age_category":"u10"},{"name":"Kid C2","age_category":"u10"},{"name":"Kid C3","age_category":"u12"}]'::jsonb);
  assert v_status_c = 'confirmed', 'a null-capacity event should confirm regardless of party size';

  select booking_id, status into v_booking_d, v_status_d
    from create_booking(v_event_id_open, v_attendee_b,
      '[{"name":"Kid D1","age_category":"u10"},{"name":"Kid D2","age_category":"u12"}]'::jsonb);
  assert v_status_d = 'confirmed', 'a null-capacity event should keep confirming later bookings too';

  select event_spaces_left(v_event_id_open) into v_spaces_open_after;
  assert v_spaces_open_after is null, 'event_spaces_left should stay null after bookings against a null-capacity event';

  raise notice 'create_booking / cancel_booking / event_spaces_left checks passed.';

  delete from events where id in (v_event_id, v_event_id_open);
  delete from attendees where id in (v_attendee_a, v_attendee_b);
  delete from auth.users where id in (v_attendee_a, v_attendee_b);
end $$;
