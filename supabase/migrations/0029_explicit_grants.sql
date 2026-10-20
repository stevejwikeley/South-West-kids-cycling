-- Explicit Data API grants for every table and view in public.
--
-- Until 30 Oct 2026 Supabase granted anon, authenticated and service_role
-- full privileges on every new public table automatically, and none of
-- 0001-0028 grant table access themselves. From that date new tables get no
-- grants, so rebuilding this schema from these files (a new project, a
-- preview branch, a local reset) would leave every table answering
-- "permission denied" to supabase-js, including the service-role client.
-- Existing tables on the live project keep the grants they already have, so
-- this is a no-op there.
--
-- These are the same privileges the platform used to grant. RLS (enabled on
-- every table, see README) is still what decides who can see or change which
-- rows; the views are security_invoker, so they inherit the RLS of
-- calendar_feed_hits. Any table added after this one needs its own grant in
-- the migration that creates it.

grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete
  on profiles, clubs, events, events_pending, watched_sources,
     site_feedback, email_subscribers, event_series, event_series_exceptions,
     attendees, bookings, booking_people, calendar_feed_hits
  to anon, authenticated, service_role;

grant select
  on calendar_feed_subscribers, calendar_feed_stats, calendar_embed_referrers
  to anon, authenticated, service_role;

grant usage, select on all sequences in schema public
  to anon, authenticated, service_role;
