-- Lets a smart-ingested/publicly-submitted candidate (or an admin editing it
-- before approval, via PendingEditPanel) carry the bookable/booking_capacity
-- signal that 0018_event_booking.sql added to the live events table.
-- Nullable, no default and no check constraint (unlike events' own
-- booking_capacity_positive) — events_pending is always a partial draft, so
-- "not yet decided" has to be representable, and the constraint that matters
-- lives on the live events table these fields eventually get copied onto.

alter table events_pending add column bookable boolean;
alter table events_pending add column booking_capacity integer;
