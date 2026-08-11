-- New discipline options — gravel and duathlon events (e.g. from Sportiva
-- Events) don't fit any existing category well; both involve a cycling leg,
-- unlike pure running events which stay out of scope for this calendar.
-- Postgres requires each ALTER TYPE ... ADD VALUE to run in its own
-- transaction/statement (can't be combined with other DDL in one batch, and
-- can't run inside an explicit BEGIN/COMMIT), so this file is just the two
-- statements with no wrapping transaction.
alter type discipline_type add value 'gravel';
alter type discipline_type add value 'duathlon';
