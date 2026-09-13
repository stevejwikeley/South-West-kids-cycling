-- Moves existing club-training rows off discipline = 'clusters' and onto
-- the new discipline = 'training' (added in 0023_add_training_discipline.sql).
--
-- Every row this touches already has kind = 'training' — none of it is a
-- real cluster session, since 0022_event_kind.sql already classified every
-- discipline = 'clusters' row as kind = 'training' by definition. There are
-- currently zero genuine cluster sessions (kind = 'race', discipline =
-- 'clusters') in the database, so this only ever reclassifies club
-- training and cannot touch a real event.
--
-- Restricting to kind = 'training' (rather than discipline = 'clusters'
-- alone) is deliberate belt-and-braces: if a genuine cluster session were
-- ever entered with kind = 'race' before this ran, it must be left alone.

update events         set discipline = 'training' where kind = 'training' and discipline = 'clusters';
update event_series   set discipline = 'training' where kind = 'training' and discipline = 'clusters';
update events_pending set discipline = 'training' where kind = 'training' and discipline = 'clusters';
