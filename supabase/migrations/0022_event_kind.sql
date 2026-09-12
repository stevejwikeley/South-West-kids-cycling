-- Training is two thirds of the calendar (47 of 67 upcoming events) drawn
-- from five weekly programmes at three clubs. `kind` separates it from
-- races so the calendar and the default .ics feed can default to races,
-- while training stays a real event row — bookings, detail pages and
-- suggest-a-change all key on events.id and must keep working.
--
-- `discipline` is deliberately untouched: training rows keep 'clusters'.

create type event_kind as enum ('race', 'training');

alter table events         add column kind event_kind not null default 'race';
alter table events_pending add column kind event_kind not null default 'race';
alter table event_series   add column kind event_kind not null default 'race';

alter table clubs add column training_note text;

comment on column clubs.training_note is
  'Free-text detail the club owns: times, term-time caveats, who to contact '
  'before a first visit. No event row carries a time of day, so this is the '
  'only place session times can be stated.';

-- ---------- backfill: clusters means training ----------

update events         set kind = 'training' where discipline = 'clusters';
update events_pending set kind = 'training' where discipline = 'clusters';
update event_series   set kind = 'training' where discipline = 'clusters';

-- ---------- backfill: attach training to its club ----------
-- Explicit organiser_name matches rather than a fuzzy lookup, so the
-- migration is deterministic and reviewable. Clubs are resolved by name
-- (never by hardcoded uuid).

update events e set club_id = c.id
from clubs c
where e.kind = 'training' and e.club_id is null
  and c.name = 'Sulis Scorpions Youth Cycling Club'
  and e.organiser_name = 'Sulis Scorpions Youth CC';

update events e set club_id = c.id
from clubs c
where e.kind = 'training' and e.club_id is null
  and c.name = 'Wheal Velocity'
  and e.organiser_name in ('Wheal Velocity', 'Wheal Velocity Cycling Club');

update events e set club_id = c.id
from clubs c
where e.kind = 'training' and e.club_id is null
  and c.name = 'Mid Devon CC'
  and e.organiser_name = 'Mid Devon Cycling Club';

-- The same three, for the series that generate those occurrences.
update event_series s set club_id = c.id
from clubs c
where s.kind = 'training' and s.club_id is null
  and ((c.name = 'Sulis Scorpions Youth Cycling Club' and s.organiser_name = 'Sulis Scorpions Youth CC')
    or (c.name = 'Wheal Velocity' and s.organiser_name in ('Wheal Velocity', 'Wheal Velocity Cycling Club'))
    or (c.name = 'Mid Devon CC'   and s.organiser_name = 'Mid Devon Cycling Club'));

-- ---------- constraints, after the backfill so they cannot fail ----------
-- events_pending is deliberately left unconstrained: an ingested candidate
-- may legitimately arrive before anyone has identified its club, and the
-- pending queue is where a human attaches one before approval.

alter table events add constraint training_requires_club
  check (kind <> 'training' or club_id is not null);

alter table event_series add constraint series_training_requires_club
  check (kind <> 'training' or club_id is not null);

create index events_training_club_date_idx
  on events (club_id, start_datetime)
  where kind = 'training';
