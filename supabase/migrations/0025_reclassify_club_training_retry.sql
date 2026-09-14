-- Re-runs 0024_reclassify_club_training.sql's data move.
--
-- Why a duplicate exists: 0024 was applied against production ahead of a
-- deploy that hadn't shipped the `training` discipline yet, so every
-- event-rendering page 500'd — a live outage. The 47 `events` rows and 2
-- `event_series` rows it had moved onto discipline = 'training' were
-- reverted with a plain `UPDATE` back to discipline = 'clusters' during the
-- incident, but 0024's row in `supabase_migrations.schema_migrations`
-- (version 20260913214527) was left in place. So the ledger now claims
-- 0024 is applied while the data is back on 'clusters' — any migration
-- tool that trusts the ledger will skip re-running it, and the mismatch
-- becomes permanent the moment this deploys.
--
-- This migration carries the same three UPDATE statements as 0024. Because
-- 0025 has never been recorded in the ledger, ordinary tooling will apply
-- it regardless of what happened to 0024's row.
--
-- Both this file and 0024 are safe to run any number of times: the `where`
-- clause only ever matches rows that are simultaneously kind = 'training'
-- and discipline = 'clusters'. A genuine cluster session is kind = 'race',
-- so it can never match and can never be touched by this statement.

update events         set discipline = 'training' where kind = 'training' and discipline = 'clusters';
update event_series   set discipline = 'training' where kind = 'training' and discipline = 'clusters';
update events_pending set discipline = 'training' where kind = 'training' and discipline = 'clusters';
