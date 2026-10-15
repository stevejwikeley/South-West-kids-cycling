-- Adds Bristol as a region alongside Devon, Cornwall and Somerset. Same
-- standalone-migration constraint as 0013_add_somerset_region.sql: ALTER
-- TYPE ... ADD VALUE must run in its own transaction before the value can
-- be referenced anywhere else. IF NOT EXISTS since this value was already
-- added directly to the shared dev project while this migration was being
-- prepared on a separate branch.

alter type region_type add value if not exists 'bristol';
