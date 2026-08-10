-- The seed data stored all-day events at 09:00+01 (a leftover placeholder
-- time) while the add/edit/suggest-change forms always normalize all-day
-- events to midnight UTC. Same calendar day, different timestamp — which
-- made every seeded event's first suggested edit show a spurious
-- start_datetime line in the diff. Normalize existing all-day rows to match.

update events
set start_datetime = ((start_datetime at time zone 'utc')::date)::timestamptz
where all_day = true;
