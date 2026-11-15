-- Security hardening from the 1 Nov 2026 RLS / pen-test review. Idempotent:
-- safe to run more than once, and safe on a database rebuilt from 0001-0030.
--
-- 1. events_pending: anonymous inserts could pick any source_type.
--    "anyone can submit a pending change" was `with check (true)`, so a
--    visitor holding the public anon key could POST straight to
--    /rest/v1/events_pending with source_type = 'smart_ingest'. The
--    check-sources cron's autoPublishQueue() (service role) publishes every
--    complete smart_ingest row without a human looking at it, so that row
--    went live on the next run: either a brand-new event, or, with
--    duplicate_of set to a live event's id, an overwrite of that event's
--    venue, date, booking link etc. Non-admins may now only queue the two
--    kinds of row the public site actually creates (change_request,
--    public_submission), which are never auto-published, and can't claim to
--    be another user or a watched source. Admin ingestion (ingest.ts runs as
--    the signed-in admin) still inserts smart_ingest via is_admin(); the
--    cron and MCP paths use the service role and bypass RLS.

drop policy if exists "anyone can submit a pending change" on events_pending;
create policy "anyone can submit a pending change"
  on events_pending for insert
  with check (
    is_admin()
    or (
      source_type in ('change_request', 'public_submission')
      and (created_by is null or created_by = auth.uid())
      and watched_source_id is null
    )
  );

-- 2. email_subscribers: drop the anonymous insert policy. Every write goes
--    through the service-role client (subscribe-email.ts, the digest cron),
--    as 0009 already says, so this policy was only an open door for anyone to
--    put arbitrary addresses on the monthly mailing list, skipping even the
--    app's email-format check.

drop policy if exists "anyone can subscribe" on email_subscribers;

-- 3. Feed-stats views ran as their owner (SECURITY DEFINER is the Postgres
--    default for views), so they bypassed calendar_feed_hits' admin-only RLS:
--    anyone with the anon key could read calendar_feed_subscribers
--    (per-subscriber fingerprints, client app, first/last seen) and the
--    other two. security_invoker makes the caller's RLS apply, the same as
--    calendar_feed_queries in 0030. Nothing in the app reads these views;
--    they're for the dashboard, where the postgres role still sees all rows.

alter view calendar_feed_subscribers set (security_invoker = true);
alter view calendar_feed_stats set (security_invoker = true);
alter view calendar_embed_referrers set (security_invoker = true);

revoke select on calendar_feed_subscribers, calendar_feed_stats, calendar_embed_referrers, calendar_feed_queries
  from anon;

-- 4. Fixed search_path on the one function without it (Supabase advisor
--    0011). Trigger-only, so low risk, but no reason to leave it mutable.

alter function set_updated_at() set search_path = public;

-- 5. Trigger functions don't need to be callable over /rest/v1/rpc.

revoke execute on function handle_new_user() from public, anon, authenticated;
revoke execute on function handle_user_invited() from public, anon, authenticated;
revoke execute on function set_updated_at() from public, anon, authenticated;

-- 6. Least privilege on table grants. 0029 restored what Supabase used to
--    grant by default, which included TRUNCATE (not subject to RLS),
--    REFERENCES and TRIGGER. PostgREST can't issue those, but nothing needs
--    them either. anon also loses write privileges on every table it has no
--    write policy for, so a future policy mistake on one of these tables
--    can't open it to logged-out visitors. RLS already blocked these writes,
--    so no current behaviour changes. anon keeps INSERT on the three public
--    submission tables (events_pending, site_feedback, calendar_feed_hits)
--    and SELECT everywhere, where RLS still decides what it sees.

revoke truncate, references, trigger on all tables in schema public from anon, authenticated;

revoke insert, update, delete
  on profiles, clubs, events, watched_sources, email_subscribers,
     event_series, event_series_exceptions, attendees, bookings, booking_people
  from anon;

revoke update, delete on events_pending, site_feedback, calendar_feed_hits from anon;
