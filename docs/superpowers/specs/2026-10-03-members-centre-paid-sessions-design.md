# Spec: members centre and paid club sessions

## Goal

Let a club (Mid Devon CC first, but nothing is Mid Devon-specific) take bookings **and payment** for its training sessions on this site. Parents get a members centre that remembers their children's details and their saved cards, books a child into a session in a couple of taps, gets confirmation emails, and can cancel with an automatic refund up to a cutoff. Coaches get a roster that shows each child's group and emergency details, and can refund a booking or cancel a whole session (refunding everyone) in one click.

Direct Debit is a stated future direction, not part of this work. The design keeps the door open for it (see "Later: Direct Debit").

## Decisions already made (with the user, 2026-10-03)

| Question | Decision |
|---|---|
| Payment provider | **Stripe**, not Shopify. Shopify is a product storefront, with no model for "a child's place on a dated session" and no API for per-booking refunds tied to our own records. Stripe Checkout gives saved cards, Apple/Google Pay, receipts, refunds by API, and later Bacs Direct Debit on the same Customer object. |
| Whose account gets paid | **Stripe Connect, one connected Standard account per club.** Money lands in the club's own Stripe account. Charges are *direct charges* on the connected account, with no platform fee. A second club can onboard later with no code changes. |
| Pricing | **Per child, by the child's group.** A club defines its groups, e.g. Mid Devon: *Group 1* (1 hr, £3.50), *Group 2* (1 hr, £3.50), *Group 3* (2 hrs, £6.00). Each child is "put in" a group, and that group's price is what they pay for any paid session at that club. |
| Refunds | **Automatic full refund if the parent cancels before a cutoff.** No automatic refund after it, though a coach can still refund manually (full or partial). A coach cancelling a session refunds everyone. |
| Booking unit | **Individual sessions.** One booking = one session, any number of the family's children. |

## Current state this builds on

- **Native booking already exists** (`docs/superpowers/specs/2026-09-07-event-booking-design.md`, migration `0018_event_booking.sql`): `attendees` (parent accounts, magic-link auth, `role: 'attendee'`), `bookings` (one per family per event, `signup_status` = confirmed/waitlisted/cancelled), `booking_people` (free-text name + age category per child), `create_booking()` / `cancel_booking()` with an advisory lock for capacity, `/my-events` dashboard, attendees list + CSV, confirmation/reminder/waitlist emails. Free events only.
- **Club training is a first-class concept** (`0022_event_kind.sql`): `events.kind = 'training'` rows always have a `club_id`, and they're usually generated from an `event_series` (weekly pattern). Mid Devon CC is already linked this way.
- **Events have no time of day.** Every row is `all_day = true` with `start_datetime` at UK midnight. Session times live in free text (`clubs.training_note`). This matters for refund cutoffs (below).
- **Organisers aren't tied to clubs.** Event access is `created_by` scoping. Nothing says "this person coaches at Mid Devon".
- **Series can't be bookable.** `bookable`/`booking_capacity` exist only on `events`, so a weekly programme would need every generated occurrence ticked by hand.
- **Testing ceiling:** Playwright only covers public, unauthenticated pages against the shared dev/prod Supabase. There's no unit-test runner. Preview (`sw-calendar-alpha.vercel.app`) shares the production database.

## Scope, split into three independently shippable plans

1. **Members centre: riders and groups** (`docs/superpowers/plans/2026-10-03-members-centre-1-riders-groups.md`). Saved children, club staff, club groups, group assignment, and booking with saved children. Still free-only. Useful on its own: the coach's roster shows groups and emergency details.
2. **Stripe payments** (`…-2-stripe-payments.md`). Club Stripe onboarding, paid sessions, Checkout with saved cards, a webhook that confirms bookings, and a saved-cards page.
3. **Cancellations and refunds** (`…-3-cancellations-refunds.md`). The refund-cutoff policy, parent self-cancel with auto-refund, coach refunds, cancel-session-and-refund-all, and refund emails.

Each plan ends with working, deployable software. Plan 2 deliberately blocks parent self-cancel on *paid* bookings ("contact your coach") until Plan 3 lands, so there's never a window where a paid place can be cancelled without a refund path.

## Data model

### Plan 1

- **`riders`**: a parent's saved child. `attendee_id`, `name`, `date_of_birth` (nullable, because guest-checkout riders only give an age category), `age_category` (nullable, used when there's no DOB), `medical_notes`, `emergency_contact_name`, `emergency_contact_phone`, `photo_consent`, `archived_at`. Check: DOB or age category must be present. Age category for a booking is derived from DOB using British Cycling's rule (age on 31 December of the session's year: U8 <8, U10 8–9, U12 10–11, U14 12–13, U16 14+, clamped to U16 since the existing enum stops there).
- **`club_staff`** (`club_id`, `profile_id`): who coaches at a club. Managed by admins on the club edit page. `is_club_staff(club_id)` SQL helper (true for admins too).
- **`club_groups`**: `club_id`, `name`, `description` (where session times go, e.g. "Saturdays 9–10am"), `price_pence` (≥ 0), `sort_order`, `active`. Public read for active groups. Writes by club staff via Server Actions.
- **`rider_club_groups`** (`rider_id`, `club_id`, PK both): `group_id`, `assigned_by` (profile id when a coach set it, null when the parent picked it), `assigned_at`. **Rule:** a parent can pick a group only while the child has no coach-set assignment at that club. Once a coach assigns one, only staff can change it. This is how "each child pays for what group they are put in" works without blocking a brand-new child from booking their first session.
- **`booking_people`** gains `rider_id`, `group_id` (both nullable for legacy rows) and later `price_pence` (Plan 2). `name`/`age_category` stay as a snapshot at booking time.
- **`event_series`** gains `bookable` and `booking_capacity`, copied onto generated occurrences like every other template field.

### Plan 2

- **`clubs`**: `stripe_account_id` (unique), `stripe_charges_enabled`.
- **`events` / `event_series`**: `paid boolean` (requires `bookable` and a `club_id`).
- **`signup_status`** gains `'pending_payment'`.
- **`bookings`**: `amount_pence`, `hold_expires_at`, `stripe_checkout_session_id` (unique), `stripe_checkout_url`, `stripe_payment_intent_id`, `paid_at`.
- **`booking_people.price_pence`**: the per-child price snapshot.
- **`stripe_customers`** (`attendee_id`, `stripe_account_id`, PK both) → `stripe_customer_id`. Customers live on the club's connected account (required for direct charges), so one parent has one Customer per club.
- **`stripe_webhook_events`** (`id` = Stripe event id): idempotency ledger.
- Events with paid bookings can't be deleted (a `before delete` trigger), because a refund trail must never cascade away. A coach cancels the session instead (Plan 3).

### Plan 3

- **`clubs.refund_cutoff_days`** (default 1, ≥ 0).
- **`booking_refunds`**: `booking_id`, `stripe_refund_id` (unique), `amount_pence`, `reason` (`parent_cancelled` / `session_cancelled` / `staff_refund` / `late_payment`), `status` (`pending` / `succeeded` / `failed`), `created_by`, `created_at`.

## Organiser UI: one signup section, not a separate "paid" toggle

The event form already has a "Free event with signup on this site" box (`components/events/EventForm.tsx`, the `bookable` checkbox + space limit). Paid sessions extend **that same section**; they don't add a parallel control:

```
[x] Take signups on this site                 ← renamed from "Free event with signup on this site"
    Space limit (optional): [ 24 ]
    Price:  (•) Free
            ( ) Paid — each child pays their club group's price
                Group 1 £3.50 · Group 2 £3.50 · Group 3 £6.00   ← read-only preview
```

- **Plan 1** renames the label to "Take signups on this site" (the box no longer implies free), and adds the identical section to the **series** form, so a weekly programme is set up once.
- **Plan 2** adds the Free/Paid radio inside it, writing `events.paid` / `event_series.paid`. "Paid" is only enabled when the selected club has active groups and a Stripe account with charges enabled. Otherwise the radio is disabled with the reason ("Mid Devon CC hasn't connected Stripe yet: set up payments").
- `bookable = true, paid = false` behaves exactly as today. `paid` can never be true without `bookable` (DB check constraint).

## Capacity with payment

Capacity still counts **people**, never bookings. It now counts `confirmed` people **plus** `pending_payment` people whose `hold_expires_at > now()`. A paid booking that fits is created as `pending_payment` with a **35-minute hold**. The Stripe Checkout Session is created with a **30-minute** `expires_at` (Stripe's minimum), so Checkout always closes before the hold does and a parent can't pay for a place that was already released. An abandoned hold simply stops counting once it's expired. The `checkout.session.expired` webhook marks it `cancelled` for tidiness, but correctness never depends on a webhook or cron arriving.

If a payment arrives for a booking that's no longer `pending_payment` (cancelled, or a webhook replayed out of order), the webhook **refunds it automatically** (`reason = 'late_payment'`) rather than over-filling the session.

## Waitlist for paid sessions

Free events keep today's auto-promotion. Paid sessions **don't auto-promote**: promoting someone into an unpaid place they might not want would hold a space hostage. Instead the waitlist is a notify list. When a paid place frees up, every waitlisted family for that session gets a "a place has opened — first to book gets it" email linking to the event page. When a waitlisted family completes a paid booking, their waitlisted row for that session is cancelled automatically.

## Remembering payment details

- One Stripe Customer per (parent, club), created lazily on first paid booking.
- Checkout is created with `customer` and `saved_payment_method_options.payment_method_save = 'enabled'`. Stripe shows a "save this card" checkbox, and saved cards are offered at the top of Checkout next time. Apple Pay / Google Pay / Link come free.
- **`/my-events/payment-methods`** lists saved cards per club (brand, last 4, expiry) with a Remove button (detaches the PaymentMethod).
- No card data ever touches our servers or database (PCI SAQ-A).

## Refund policy (Plan 3)

Because events have no time of day, the cutoff is in **days**: with `refund_cutoff_days = N`, a parent's cancellation is refunded in full if it happens before **UK midnight at the start of the day N−1 days before the session**:

- `N = 1` (default): "cancel by 23:59 the day before for a full refund".
- `N = 2`: "cancel by 23:59 two days before".
- `N = 0`: same-day cancellations are refunded too, up to 23:59 on the session day.

After the cutoff, a parent can still cancel (freeing the place for the waitlist) but gets no automatic refund. The UI says so before they confirm. Staff can refund any amount up to what's left unrefunded, at any time.

**Cancel session (staff):** sets `events.status = 'cancelled'`, cancels every active booking, fully refunds every paid one, and emails every family. Stripe keeps its processing fee on refunds (UK Standard pricing), so a refunded £3.50 session still costs the club its fee. The coach-facing UI states this.

## Emails (all via existing `lib/email/resend.ts`, all best-effort)

| Email | Plan | When |
|---|---|---|
| Booking confirmation (now lists each child's group, plus amount paid for paid sessions) | 1, 2 | Free booking created / paid booking confirmed by webhook |
| Payment not completed | 2 | `checkout.session.expired`, so the parent knows the place was released |
| Cancellation + refund confirmation | 3 | Parent self-cancel (states refunded amount, or "no refund — after cutoff") |
| Session cancelled by club | 3 | Staff cancel-session (states refund amount) |
| Place opened up (paid waitlist) | 3 | A paid place frees up |
| Refund failed (to admin) | 3 | `refund.updated` with status `failed` |

Stripe's own receipt email covers the payment receipt itself. Clubs enable it in their Stripe dashboard (Settings → Customer emails), and the onboarding page tells them to.

## Security and data protection

- RLS stays the security boundary. New tables follow the `0002_auth.sql` conventions: parents read their own rows; admins read all; club staff read riders, bookings and attendees only for **their club's** events via `is_club_staff()`.
- Riders' `medical_notes` and emergency contacts are **special-category / children's data**. They're visible only to the parent, admins, and staff of a club the child has booked with. They're never exported in the public CSV path, never sent to Claude, and never logged to Sentry. A rider can be archived by the parent. Hard-deleting a parent's account cascades to riders.
- Every write that touches money goes through a Server Action or route handler that verifies identity first. The Stripe webhook verifies the `Stripe-Signature` header against `STRIPE_WEBHOOK_SECRET` before doing anything.
- Refund amounts are always computed server-side from the DB (`amount_pence` minus already-refunded), never accepted from the client except as a staff-entered partial amount that's validated against that ceiling.

## Environment

| Variable | Purpose |
|---|---|
| `STRIPE_SECRET_KEY` | Platform secret key (`sk_test_…` on preview, `sk_live_…` on production). |
| `STRIPE_WEBHOOK_SECRET` | Signing secret of the **Connect** webhook endpoint (`/api/stripe/webhook`, "Events on connected accounts"). |

Preview shares the production Supabase project, so test-mode Stripe on preview writes real booking rows. Test with a dedicated test event, and delete it afterwards with the `scripts/` cleanup SQL in Plan 2.

## Later: Direct Debit (not planned yet)

Stripe's **Bacs Direct Debit** works on the same connected-account Customers this design creates. The likely shape: a "Set up Direct Debit" button in the members centre creates a Checkout Session in `mode: 'setup'` with `payment_method_types: ['bacs_debit']`, then bookings charge the saved mandate off-session (`PaymentIntent` with `off_session: true`) instead of redirecting to Checkout, or a monthly batch charges the month's sessions. Bacs has a 3-working-day settlement and mandate-notification email rules, so it needs its own spec. Nothing in Plans 1–3 blocks it.

## Out of scope

- Multi-session basket / "book the whole term". One Checkout per session for now. Stripe's per-transaction fixed fee (~20p) is noticeable on £3.50, so a basket is the most valuable follow-up.
- Per-group capacity (e.g. max 12 in Group 3). Capacity stays per session.
- Memberships / member vs non-member pricing.
- Editing which children are on an existing booking (cancel and rebook).
- Coach-facing payouts / reconciliation reports beyond what each club's Stripe dashboard already shows.
