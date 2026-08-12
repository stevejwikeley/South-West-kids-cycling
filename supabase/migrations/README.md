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
