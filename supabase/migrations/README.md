# Migrations

Plain numbered SQL files (`0001_...sql`, `0002_...sql`, ...), applied in order. There is **no linked Supabase CLI project** for this repo (no `supabase/config.toml`) and no direct Postgres connection string in `.env.local` — these files exist for version control and review, not for `supabase db push` or any other automated apply. Applying one is a manual step: paste its contents into the [Supabase Dashboard SQL editor](https://supabase.com/dashboard/project/_/sql/new) for this project and run it.

## Adding a new migration

1. Create the next-numbered file, e.g. `0009_whatever.sql`.
2. Write a short comment at the top explaining *why*, not just what — the existing files lean heavily on this (see `0003_fix_handle_new_user.sql` for an example of documenting a bug fix so the next person doesn't reintroduce it).
3. Update `lib/supabase/types.ts` by hand to match (there's no `supabase gen types` pipeline wired up either — see the comment at the top of that file).
4. Run the SQL in the Supabase Dashboard yourself, or ask whoever's making the change to run it. **The app will deploy fine without this step but the affected feature will error at runtime** — TypeScript has no way to know the live schema doesn't match `types.ts`.
5. Commit the migration file alongside the code that depends on it.

## RLS convention

Every table has RLS enabled. The two patterns used throughout:

```sql
-- Public/anonymous insert (e.g. events_pending, site_feedback):
create policy "anyone can submit ..." on <table> for insert with check (true);

-- Admin-only read/write, via the is_admin() helper defined in 0002_auth.sql:
create policy "admins can ..." on <table> for select using (is_admin());
```

Follow one of these for any new table rather than inventing a new access pattern — `is_admin()` already exists and checking `profiles.role` directly in a new policy would just be a less-obvious way of writing the same thing.

## What's in each migration

| File | What it does |
|---|---|
| `0001_init.sql` | Initial schema — `events`, `clubs`, `events_pending`, `watched_sources`. |
| `0002_auth.sql` | Auth wiring: auto-create a `profiles` row on signup, `is_admin()` helper, write-side RLS policies. |
| `0003_fix_handle_new_user.sql` | Bug fix — an untyped `CASE` expression was breaking the signup trigger. |
| `0004_normalize_all_day_times.sql` | Data fix — normalizes seeded all-day events to midnight UTC to match app behavior. |
| `0005_watched_source_status.sql` | Adds fetch-outcome tracking to `watched_sources` so the admin UI can surface "this site blocks automated requests". |
| `0006_add_gravel_duathlon_disciplines.sql` | Adds `gravel` and `duathlon` to the discipline enum. |
| `0007_phase4_confidence_tracking.sql` | Adds correction-rate tracking (`field_flags`, `was_edited`, `published_count`, `corrected_count`) — data collection only, doesn't change publishing behavior. |
| `0008_site_feedback.sql` | Adds `site_feedback` for the dismissable feedback popup. |
| `0009_email_subscribers.sql` | Adds `email_subscribers` for the monthly email digest (single opt-in, per-row unsubscribe token). |
| `0010_public_submission_source.sql` | Adds `'public_submission'` to `source_type_enum` for the public `/submit-event` page. |
| `0011_super_admin_role.sql` | Adds `'super_admin'` to `user_role` — just the enum value; `ALTER TYPE ... ADD VALUE` must run in its own statement before the value can be referenced elsewhere (same constraint as `0006`). |
| `0012_super_admin_grants.sql` | Broadens `is_admin()` to cover `super_admin` (so every existing `is_admin()`-gated policy extends automatically), adds a separate `is_super_admin()` for the promote/demote-admin actions, updates the signup trigger, and promotes the existing site-owner profile to `super_admin`. |
| `0013_add_somerset_region.sql` | Adds `'somerset'` to `region_type` alongside `devon`/`cornwall`/`both`. `both` keeps its existing Devon+Cornwall meaning rather than being redefined to include Somerset. |
| `0014_invite_role_metadata.sql` | Updates the signup trigger to read an intended role (`admin` or `organiser`) out of `raw_user_meta_data` when present, so `inviteTeamMember` can invite someone directly into a role instead of always defaulting new signups to `organiser`. |
| `0015_watched_source_created_by.sql` | Adds `created_by` to `watched_sources` and replaces the delete policy so a regular admin can only delete a source they added themselves; `super_admin` keeps an override. |
| `0016_site_feedback_email.sql` | Adds an optional `email` column to `site_feedback` so respondents can leave contact info for follow-up. |
| `0017_event_series.sql` | Adds `event_series` (weekly recurrence rule + shared template) and `event_series_exceptions` (skip dates), plus `series_id`/`occurrence_date`/`series_detached` on `events` so generated occurrences are ordinary rows the existing edit/delete/RLS/ICS code already handles unmodified. |
| `0018_event_booking.sql` | Adds `bookable`/`booking_capacity` to `events`, new `attendees`/`bookings`/`booking_people` tables, and `create_booking()`/`cancel_booking()`/`event_spaces_left()` functions for the native event-booking system. Extends `handle_new_user()` to route `role: 'attendee'` signups into `attendees` instead of `profiles`. |
| `0019_pending_bookable.sql` | Adds nullable `bookable`/`booking_capacity` to `events_pending`, so a pending candidate can carry that signal through to approval via `PendingEditPanel`. |
| `0020_club_write_access.sql` | Adds `is_staff()` (true for any signed-in admin/organiser/super_admin) and insert/update/delete policies on `clubs` gated on it — the table previously had only a public-read policy, so nothing could create or edit a club through the app. |
| `0021_event_description.sql` | Adds a nullable `description` column to `events`, `events_pending`, and `event_series` — shown on the event detail page, generated from the organiser URL (or, for AI-ingested events, as part of extraction) rather than always hand-typed. |
| `0022_event_kind.sql` | Adds the `event_kind` enum (`'race'`, `'training'`) and a `kind` column (`not null default 'race'`) to `events`, `events_pending`, and `event_series`, plus `clubs.training_note` for session-time detail that no event row can carry. Backfills `kind = 'training'` from `discipline = 'clusters'`, then backfills `club_id` on those training rows from an explicit `organiser_name` → club name match for three named clubs (Sulis Scorpions, Wheal Velocity, Mid Devon CC) — **the backfill is not reversible**: rerunning it after `organiser_name` has since changed, or after `club_id` has been hand-edited, would not recover the original state, so restoring from a pre-migration dump is the only way back. Adds `training_requires_club` (`events`) and `series_training_requires_club` (`event_series`) check constraints after the backfill so they can't fail against existing data; `events_pending` is deliberately left unconstrained since an ingested training candidate can arrive before a club is known. Adds a partial index (`events_training_club_date_idx`) for the per-club training feed's query shape. |
| `0023_add_training_discipline.sql` | Adds `'training'` to `discipline_type`, correcting a conflation between `kind` (race vs. training) and `discipline` (what activity it is) — `0022` had left every club-training row labelled `discipline = 'clusters'`, which made a genuine cluster session (several clubs, a few times a year, a real event) indistinguishable from ordinary club training. Enum-value-only, in its own transaction — see `0024`/`0025`. |
| `0024_reclassify_club_training.sql` | The data half of `0023`'s correction: moves existing club-training rows (`events`/`event_series`/`events_pending`) off `discipline = 'clusters'` onto `discipline = 'training'` where `kind = 'training'`. Applied ahead of a deploy that didn't yet have the `training` discipline, which 500'd every event-rendering page — see `0025`. |
| `0025_reclassify_club_training_retry.sql` | Re-runs 0024's data move (`events`/`event_series`/`events_pending` off `discipline = 'clusters'` onto `discipline = 'training'` where `kind = 'training'`). 0024 was applied ahead of a deploy that didn't yet have the `training` discipline, causing a live outage; the data change was reverted by hand during the incident but 0024's row in `supabase_migrations.schema_migrations` was left in place, so the ledger still claims it's done. 0025 has no ledger row, so ordinary tooling re-runs the move. Both files are idempotent — the `where` clause can never match a genuine cluster session (`kind = 'race'`). |
| `0026_feed_hit_logging.sql` | Wires up `/calendar.ics` and `/embed` to actually write to `calendar_feed_hits`, a raw hit log plus a `classify_calendar_client()` UA classifier and two subscriber-estimate views that were already live on this project but had never been committed here (nothing wrote to the table, so it sat at 0 rows) — the idempotent `create table if not exists`/`create or replace` forms document that prior state as well as apply the new work. Adds a nullable `referer` column (populated only for `/embed`, since calendar client software doesn't send one), scopes the two existing views to `feed = 'calendar.ics'` so subscriber counting can't absorb embed pageloads, and adds `calendar_embed_referrers` — hostnames grouped from the referer, so it's possible to see which club sites have actually installed the widget. |
| `0027_add_bristol_region.sql` | Adds `'bristol'` to `region_type` alongside `devon`/`cornwall`/`somerset`/`both`. `IF NOT EXISTS` since the value was applied directly to the shared dev project while this migration was being prepared on a separate branch. |
