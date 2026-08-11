-- Phase 4 groundwork (spec section 4): correction-rate tracking and
-- field-level "needs verification" flags. This only accumulates data —
-- approval stays fully manual, nothing here changes what publishes. The
-- spec is explicit that the auto-publish flip shouldn't happen until this
-- data actually exists (section 12: "once Phase 3 has run long enough to
-- generate real correction-rate data").

alter table events_pending
  add column field_flags jsonb,
  add column watched_source_id uuid references watched_sources (id) on delete set null,
  add column was_edited boolean not null default false;

alter table watched_sources
  add column published_count integer not null default 0,
  add column corrected_count integer not null default 0;
