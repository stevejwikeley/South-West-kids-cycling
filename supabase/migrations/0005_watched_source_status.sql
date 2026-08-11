-- Tracks the outcome of the last fetch attempt per watched source, so the
-- admin UI can surface "this site blocks automated fetching" immediately
-- (on add, and on-demand via a manual check) rather than only discovering it
-- when the nightly cron silently fails.

alter table watched_sources
  add column last_status text check (last_status is null or last_status in ('ok', 'error')),
  add column last_error text;
