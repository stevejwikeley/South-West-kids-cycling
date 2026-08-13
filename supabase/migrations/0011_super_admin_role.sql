-- Third tier above admin — see 0012 for what it actually grants. Postgres
-- requires ALTER TYPE ... ADD VALUE to run in its own transaction before
-- the value can be referenced anywhere else (same constraint as
-- 0006_add_gravel_duathlon_disciplines.sql), so this migration is only the
-- enum addition; 0012 has the actual logic and must run afterward.

alter type user_role add value 'super_admin';
