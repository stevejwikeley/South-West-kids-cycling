-- Wires up calendar-feed instrumentation for real, and documents the parts
-- of it that were already live on this project but never committed here.
--
-- `calendar_feed_hits` (raw log), `classify_calendar_client()` (a User-Agent
-- classifier distinguishing Google/Apple/Outlook calendar sync agents from
-- browsers and bots), and the `calendar_feed_subscribers`/`calendar_feed_stats`
-- views (a fingerprint only counts as a "subscriber" if it recurs on 2+
-- distinct days in the last 14, which is what separates an actual standing
-- subscription from someone opening the .ics link once in a browser) were
-- applied directly against this database at some point and never made it
-- into a migration file — nothing in the app writes to calendar_feed_hits,
-- so it has sat at 0 rows. The `create table if not exists` / `create or
-- replace` forms below are idempotent specifically so this migration is
-- safe to apply here (where the objects already exist) and would also
-- recreate them correctly on a fresh database.
--
-- New in this migration:
--   * a nullable `referer` column — /embed can now log which site iframed
--     it, which the previous shape (fingerprint/user_agent/feed only, built
--     for classifying calendar-client fetches) had no room for
--   * a `feed = 'calendar.ics'` scope on both existing views, so counting
--     .ics subscribers doesn't start absorbing /embed pageloads the moment
--     that route begins writing rows too
--   * calendar_embed_referrers, the read side for the new column

create table if not exists calendar_feed_hits (
  id bigint generated always as identity primary key,
  fetched_at timestamptz not null default now(),
  fingerprint text not null,
  user_agent text,
  feed text not null default 'calendar.ics'
);

alter table calendar_feed_hits add column if not exists referer text;

create index if not exists calendar_feed_hits_fetched_at_idx on calendar_feed_hits (fetched_at desc);
create index if not exists calendar_feed_hits_fingerprint_idx on calendar_feed_hits (fingerprint, fetched_at desc);

alter table calendar_feed_hits enable row level security;

drop policy if exists "admins can read feed hits" on calendar_feed_hits;
create policy "admins can read feed hits"
  on calendar_feed_hits for select
  using (is_admin());

-- Insert-only and open to anyone: every visitor to /calendar.ics or /embed
-- is anonymous by definition (no auth on either route), and this is the app
-- logging its own traffic, not user-supplied data reaching a privileged
-- table — the only columns written are a one-way hash (never the raw IP),
-- and the User-Agent/Referer header values the request already sent.
create policy "public can log feed hits"
  on calendar_feed_hits for insert
  with check (true);

create or replace function public.classify_calendar_client(ua text)
returns text
language sql
immutable
set search_path to ''
as $function$
  select case
    when ua is null or btrim(ua) = ''                       then 'unknown'
    when ua ilike '%google-calendar%'
      or ua ilike '%google-apps-calendar%'                   then 'google'
    when ua ilike '%calendaragent%'
      or ua ilike '%dataaccessd%'
      or ua ilike '%ios/%'
      or ua ilike '%macos/%'                                 then 'apple'
    when ua ilike '%outlook%'
      or ua ilike '%microsoft%'
      or ua ilike '%office%'                                 then 'outlook'
    when ua ilike '%thunderbird%'
      or ua ilike '%lightning%'
      or ua ilike '%fastmail%'
      or ua ilike '%davx%'
      or ua ilike '%ical%'
      or ua ilike '%calcurse%'                               then 'other_calendar'
    when ua ilike '%bot%'
      or ua ilike '%crawler%'
      or ua ilike '%spider%'
      or ua ilike '%curl%'
      or ua ilike '%wget%'
      or ua ilike '%python-requests%'
      or ua ilike '%node-fetch%'
      or ua ilike '%axios%'
      or ua ilike '%headless%'
      or ua ilike '%uptime%'
      or ua ilike '%monitor%'
      or ua ilike '%vercel%'                                 then 'bot'
    when ua ilike '%mozilla%'                                then 'browser'
    else 'other'
  end;
$function$;

-- Same subscriber definition as before, now scoped to feed = 'calendar.ics'
-- so /embed traffic (once it starts writing rows) can never be counted as
-- a calendar subscription.
create or replace view calendar_feed_subscribers as
select
  fingerprint,
  classify_calendar_client(user_agent) as client,
  count(*) as fetches,
  count(distinct date_trunc('day', fetched_at)) as active_days,
  min(fetched_at) as first_seen,
  max(fetched_at) as last_seen
from calendar_feed_hits h
where fetched_at > now() - interval '14 days'
  and feed = 'calendar.ics'
  and classify_calendar_client(user_agent) not in ('bot', 'browser')
group by fingerprint, classify_calendar_client(user_agent)
having count(distinct date_trunc('day', fetched_at)) >= 2;

create or replace view calendar_feed_stats as
select
  (select count(*) from calendar_feed_subscribers) as estimated_subscribers,
  (select count(*) from calendar_feed_subscribers where client = 'google') as via_google,
  (select count(*) from calendar_feed_subscribers where client = 'apple') as via_apple,
  (select count(*) from calendar_feed_subscribers where client = 'outlook') as via_outlook,
  (select count(*) from calendar_feed_subscribers where client in ('other_calendar', 'unknown', 'other')) as via_other,
  (select count(distinct fingerprint) from calendar_feed_hits
     where fetched_at > now() - interval '14 days'
       and feed = 'calendar.ics'
       and classify_calendar_client(user_agent) = 'browser') as oneoff_downloads_14d,
  (select count(*) from calendar_feed_hits
     where fetched_at > now() - interval '14 days'
       and feed = 'calendar.ics') as total_fetches_14d;

-- The read side for embed attribution. Grouped by hostname rather than the
-- full referer URL, so /junior-section and / on the same club site count
-- as one embedding site rather than fragmenting. A null group is real
-- data, not a gap: some browsers and site builders strip the Referer
-- header entirely, so "unattributable" embed traffic is worth seeing as
-- its own line rather than silently vanishing from the total.
create or replace view calendar_embed_referrers as
select
  case
    when referer is null or referer = '' then null
    else regexp_replace(referer, '^https?://([^/]+).*$', '\1')
  end as referrer_host,
  count(distinct fingerprint) as distinct_visitors,
  count(*) as hits,
  min(fetched_at) as first_seen,
  max(fetched_at) as last_seen
from calendar_feed_hits
where feed = 'embed'
group by 1
order by hits desc nulls last;
