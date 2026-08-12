-- New source_type for the public "submit an event" page (paste a link/text,
-- or fill in a form) — distinct from smart_ingest (admin-run/watched-source
-- AI extraction) purely so the pending queue can tell an admin who/what a
-- candidate came from, even though both share the same insert/dedup/approve
-- pipeline. Postgres requires ALTER TYPE ... ADD VALUE to run in its own
-- statement, same as 0006_add_gravel_duathlon_disciplines.sql.

alter type source_type_enum add value 'public_submission';
