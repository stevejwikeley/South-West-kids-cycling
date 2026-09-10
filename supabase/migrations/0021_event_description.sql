-- Adds an optional longer-form description shown on the event detail page.
-- Nullable everywhere, same rollout as club_id (0001_init.sql): events,
-- events_pending (so a pending candidate carries it through review) and
-- event_series (so generated occurrences inherit it like organiser_name).
-- No RLS changes needed — existing policies already gate writes to these
-- three tables by column-agnostic role checks.

alter table events add column description text;
alter table events_pending add column description text;
alter table event_series add column description text;
