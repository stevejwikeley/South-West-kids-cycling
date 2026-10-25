-- Records which feed a hit asked for, not just that it happened.
--
-- calendar_feed_hits so far only knew "a client fetched /calendar.ics" — not
-- whether that was the full calendar or a ?discipline=/region=/club=/kind=
-- filtered one, so there was no way to see which filtered feeds anyone
-- actually subscribes to. The new nullable `query` column holds the request's
-- query string (no leading "?"), null for the plain unfiltered feed. Rows
-- logged before this migration are null too, so they read as "unfiltered"
-- in the view below — an undercount of filtered feeds for anything older
-- than this migration, not a misattribution of any one fetch.
--
-- It also gives Google Calendar subscribers a partial count: Google fetches
-- each distinct URL once from its own servers on behalf of everyone
-- subscribed to it, so per-fingerprint counting can't see how many people
-- sit behind one Google fetch — but each distinct filtered URL Google keeps
-- polling is at least one real subscription to that URL.
--
-- calendar_feed_queries is the read side: per feed URL over the same 14-day
-- window and the same 2+-distinct-days "subscriber" rule as
-- calendar_feed_subscribers, plus one-off browser downloads of that URL.
-- security_invoker so calendar_feed_hits' admin-only RLS applies to it.

alter table calendar_feed_hits add column if not exists query text;

create or replace view calendar_feed_queries
with (security_invoker = true)
as
with recent as (
  select
    coalesce(query, '') as query,
    fingerprint,
    classify_calendar_client(user_agent) as client,
    fetched_at
  from calendar_feed_hits
  where feed = 'calendar.ics'
    and fetched_at > now() - interval '14 days'
),
per_fetcher as (
  select query, fingerprint, client, count(distinct date_trunc('day', fetched_at)) as active_days
  from recent
  group by query, fingerprint, client
)
select
  query,
  count(*) filter (where client not in ('bot', 'browser') and active_days >= 2) as subscribers,
  count(*) filter (where client = 'google' and active_days >= 2) as via_google,
  count(*) filter (where client = 'apple' and active_days >= 2) as via_apple,
  count(*) filter (where client = 'browser') as oneoff_downloads
from per_fetcher
group by query
order by subscribers desc, oneoff_downloads desc;

grant select on calendar_feed_queries to anon, authenticated, service_role;
