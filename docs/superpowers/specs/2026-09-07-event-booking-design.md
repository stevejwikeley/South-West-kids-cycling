# Spec: lightweight booking system for free events

## Goal

Let an organiser or admin mark one of their events as bookable directly on this site (instead of linking out to an external booking page), with a capacity limit, a signup form that supports adding multiple people per family, a waitlist once full, confirmation and day-before reminder emails, self-service cancellation, and an attendee list + ad-hoc email-attendees tool for the organiser/admin. Attendees (parents) get a lightweight account via the same Supabase Auth magic-link mechanism already used for admin/organiser login, so they can see all their upcoming bookings in one place.

## Current state

- **No event description page exists yet.** `app/events/[id]/suggest-change/page.tsx` is the only route under `/events/[id]`; there's no `/events/[id]` page itself to view an event's full details. The calendar page shows events in a list/panel, and each event's `booking` field (`lib/types.ts`) is just an external URL shown as a link, with `bookingStatus: "open" | "planned"` as the only state.
- **Two trusted roles exist today** (`super_admin`/`admin`/`organiser`, all in `profiles`, `lib/auth.ts`), both created via invite-only flows (`inviteTeamMember`). There is no public self-signup account of any kind — this feature introduces the first one.
- **Email** goes through Resend (`lib/email/resend.ts`) with one template file per email type (`contact.ts`, `monthly-digest.ts`, `pending-digest.ts`). Crons authenticate via a shared `CRON_SECRET` bearer token (`vercel.json`, four existing entries).

## Scope

Opt-in per event: an organiser/admin marks a specific event `bookable` and sets a capacity when creating/editing it. Non-bookable events are unaffected and keep showing their external `booking` link as today. This is a native alternative to that link, not a replacement for it everywhere.

## Data model

New migration, following the existing numbered-migration convention (next is `0018_...`):

```sql
-- events: opt into native booking
alter table events add column bookable boolean not null default false;
alter table events add column booking_capacity integer; -- null = bookable, no limit enforced

-- attendees: parent/guardian accounts, keyed by their Supabase Auth user id
create table attendees (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  contact_name text not null,
  phone text,
  created_at timestamptz not null default now()
);

-- bookings: one row per family's signup for one event
create table bookings (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  attendee_id uuid not null references attendees(id) on delete cascade,
  status text not null check (status in ('confirmed', 'waitlisted', 'cancelled')),
  created_at timestamptz not null default now()
);

-- booking_people: one row per person on a booking (the parent's children)
create table booking_people (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id) on delete cascade,
  name text not null,
  age_category text not null -- reuses the existing AgeCategory union: u8/u10/u12/u14/u16
);
```

Capacity is `count(booking_people)` joined through `confirmed` bookings for an event, compared against `booking_capacity` — counting per person (not per booking), so a family of three uses three spaces.

**RLS**, following the existing `is_admin()` / `club_id` conventions (`0002_auth.sql`, `supabase/migrations/README.md`):

- `attendees`: a user can select/update only their own row (`id = auth.uid()`).
- `bookings` / `booking_people`: an attendee can select/insert/update rows tied to their own `attendee_id`; admins can see all; organisers can see only bookings for events where `events.club_id` matches their own club, same scoping already applied to `events` itself.
- Booking creation, cancellation, and waitlist promotion happen through Server Actions using the anon client (subject to RLS) where the acting user is the attendee, and through the service-role client only for the cron reminder job and admin/organiser broadcast email, matching how the rest of the app already splits these two client types.

## Booking flow

1. **Signup** (`/events/[id]`, shown when `bookable` is true): a form for contact details (name, email, phone) plus a repeatable "add a child" block (name + age category). No login required first — guest checkout.
2. **`createBooking` Server Action**: looks up an `attendees` row by email or creates one (and its underlying `auth.users` entry, via Supabase Auth's admin API, so a magic link can later be sent to it); inserts the `bookings` row and its `booking_people` rows in one transaction. The capacity check (count existing `confirmed` people vs `booking_capacity`) happens inside that same transaction so two simultaneous signups can't both claim the last spot. If the new people fit in the remaining capacity, status is `confirmed`; otherwise the whole booking is `waitlisted` together — a family is never split between confirmed and waitlisted.
3. **Confirmation email**, sent immediately after insert, worded differently for `confirmed` vs `waitlisted`. Contains a magic link to "manage this booking", which is also how the attendee logs in going forward.
4. **Self-service cancel**, from the attendee's dashboard or the email link: sets `status = 'cancelled'`. If the cancelled booking was `confirmed`, this frees up space and triggers waitlist promotion.
5. **Waitlist promotion**: walk `waitlisted` bookings for the event oldest-first; the first one whose person-count fits in the newly freed space is flipped to `confirmed` and sent a "you're in" email. If it doesn't fit, move to the next-oldest waitlisted booking rather than blocking — so a large waitlisted family doesn't stall a smaller one behind them from taking a spot that opened up.
6. **Reminder email**: new cron (`/api/cron/booking-reminders`, added to `vercel.json` alongside the existing four, same `CRON_SECRET` auth) runs daily, finds all `confirmed` bookings for events happening tomorrow, and sends one reminder per attendee (not per child).

## Attendee dashboard

A new route (e.g. `app/bookings/`) gated on having a valid attendee session: lists the signed-in attendee's upcoming (non-cancelled, event date in the future) bookings with event name/date/venue, the people on each booking, and a cancel button per booking. Follows the same session-check pattern `lib/auth.ts` already establishes for admin/organiser pages, but reading from `attendees` instead of `profiles`.

## Admin / organiser view

- **Event form** (`EventForm`): new "Free event with signup" section — a `bookable` toggle and a `booking_capacity` number input (blank = unlimited), alongside the existing fields an organiser/admin can already set on their own events.
- **Attendees tab**, on the event's admin/organiser edit view: table of bookings (contact name, email, phone, their people with age categories, status), a running "X confirmed / Y waitlisted / capacity Z" count, and CSV export reusing `lib/csv.ts`. Organisers see this only for events they own (`club_id` scoping, same as everywhere else); admins see it for any event.
- **Message attendees**: a plain subject + body form that sends one email to every `confirmed` attendee for that event via Resend, following the same pattern as `lib/email/contact.ts`. No templating, no scheduling — a single ad-hoc broadcast per submission.

## Error handling

- Capacity race conditions are handled by doing the count-and-insert inside one DB transaction (see step 2 above), not by a client-side check before submit.
- If the confirmation/reminder/waitlist-promotion email fails to send, the booking/cancellation/promotion itself must not roll back — the DB write is the source of truth for who has a space; email delivery failures are logged to Sentry (matching how the rest of the app treats email as best-effort) rather than blocking the transaction.
- `booking_capacity` left blank means bookable-but-unlimited (an organiser wants signups tracked without capping them) — every capacity comparison must treat `null` as "always fits", not as zero.

## Testing

New Playwright specs under `e2e/`, following the existing per-feature-file convention (`contact.spec.ts`, `submit-event.spec.ts`): a booking spec covering signup → confirmation, hitting capacity → waitlisted, and self-service cancel → waitlist promotion. Admin/organiser attendee-list and message-attendees flows can extend the existing `auth-gate.spec.ts` patterns for role-gated pages.

## Out of scope for v1

- Paid events / payment collection — this system is for free events only, per the request.
- Editing a booking's people after creation (changing a child's name/age) — cancel and rebook covers this for v1.
- Attendee self-service "change what I'm subscribed to"-style preference management — not applicable here, but noting the parallel to the existing subscribe-preferences spec in case this dashboard later grows similar needs.
- Recurring-series-aware booking (a single signup covering multiple weekly occurrences) — v1 bookings are per single event occurrence, same granularity the `events` table already uses per generated occurrence.

## Suggested build order

1. Migration + `attendees`/`bookings`/`booking_people` tables and RLS.
2. `/events/[id]` description page (needed regardless of booking, since it doesn't exist yet) with the signup form gated behind `bookable`.
3. `createBooking` Server Action with the in-transaction capacity check, confirmation email.
4. Attendee dashboard + self-service cancel + waitlist promotion.
5. Admin/organiser attendees tab, CSV export, message-attendees broadcast.
6. Day-before reminder cron.
