-- From 30 Oct 2026 Supabase no longer auto-grants Data API access to new
-- tables in "public". Existing tables keep their grants, but any rebuild from
-- these migrations (supabase db reset, preview branches, a new project) would
-- leave every table unreachable from supabase-js. Grant explicitly what the
-- platform used to grant by default; RLS policies still decide who can
-- actually see or change each row. Idempotent on databases that already have
-- these grants.

grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete
  on profiles, clubs, events, events_pending, watched_sources
  to anon, authenticated, service_role;
