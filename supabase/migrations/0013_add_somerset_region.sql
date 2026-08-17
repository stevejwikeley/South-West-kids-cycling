-- Adds Somerset as a third region alongside Devon and Cornwall. "both"
-- keeps its existing meaning (an event serving Devon and Cornwall) rather
-- than being redefined to include Somerset — a Devon+Cornwall event
-- extracted before this migration shouldn't silently start matching a new
-- Somerset filter it was never actually reviewed against. Same standalone-
-- migration constraint as 0011_super_admin_role.sql: ALTER TYPE ... ADD
-- VALUE must run in its own transaction before the value can be referenced
-- anywhere else.

alter type region_type add value 'somerset';
