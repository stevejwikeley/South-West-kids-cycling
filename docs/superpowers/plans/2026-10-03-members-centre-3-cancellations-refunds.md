# Members Centre, Plan 3: Cancellations and Refunds

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Parents can cancel paid bookings and are refunded automatically up to the club's cutoff. Coaches can refund any booking (full or partial), cancel a booking, or cancel a whole session and refund every family in one click. Every refund is recorded, emailed, and tracked to completion via webhook.

**Architecture:** One pure policy module decides refund eligibility and validates staff amounts (unit-tested, DST-aware). One server module, `issueRefund()`, is the **only** code that creates Stripe refunds: it computes the ceiling from the DB, uses idempotency keys, and records every refund in `booking_refunds`. Postgres functions do the state changes atomically (`cancel_booking` now allows paid bookings and reports what was paid; new `staff_cancel_booking` / `cancel_session` check staff permission themselves). The existing Stripe webhook gains `refund.updated` / `refund.failed` to settle refund status.

**Tech Stack:** Next.js 16 Server Actions, Supabase, Stripe (Connect, direct charges), Resend, Vitest.

**Spec:** [docs/superpowers/specs/2026-10-03-members-centre-paid-sessions-design.md](../specs/2026-10-03-members-centre-paid-sessions-design.md)

**Depends on:** [Plan 2](2026-10-03-members-centre-2-stripe-payments.md) merged, `0028`/`0029` applied, Mid Devon connected.

## Global Constraints

- Everything in Plans 1 and 2's Global Constraints still applies.
- Migration is **`0030`**.
- `issueRefund()` (`lib/payments/refunds.ts`) is the **only** place `stripe.refunds.create` may be called, including Plan 2's late-payment refund, which this plan migrates onto it.
- A refund amount is **never** taken from the client without being validated server-side against `amount_pence − already refunded (non-failed)`. Parents never choose an amount at all.
- Refund cutoff is in **days**, compared on the **UK local date** (`Europe/London`), never UTC. `refund_cutoff_days = N` means the last refundable day is `sessionDate − N days`, inclusive: N=1 → "by 23:59 the day before", N=0 → "up to 23:59 on the day".
- A parent may always cancel, before or after the cutoff. After it they get no automatic refund, and the UI must say so **before** they confirm.
- Paid sessions don't auto-promote from the waitlist. A freed paid place emails every waitlisted family for that session instead.
- Stripe keeps its fee on refunds (UK Standard pricing). Any staff-facing "refund everyone" UI states this.
- Email is best-effort; a failed email never blocks or undoes a cancellation/refund.

---

### Task 1: Refund policy (pure)

**Files:**
- Create: `lib/payments/refund-policy.ts`
- Create: `lib/payments/refund-policy.test.ts`

**Interfaces:**
- Produces:
  - `lastRefundableDate(sessionDate: string, cutoffDays: number): string` (`YYYY-MM-DD`)
  - `ukLocalDate(nowIso: string): string`
  - `parentRefund(input: { sessionDate: string; cutoffDays: number; nowIso: string; amountPence: number; refundedPence: number }): { eligible: boolean; refundPence: number; lastRefundableDate: string }`
  - `validateStaffRefund(input: { requestedPence: number | null; amountPence: number; refundedPence: number }): { ok: false; error: string } | { ok: true; refundPence: number }` (`null` = refund everything left)

- [ ] **Step 1: Write the failing tests**

```ts
// lib/payments/refund-policy.test.ts
import { describe, expect, it } from "vitest";
import { lastRefundableDate, parentRefund, ukLocalDate, validateStaffRefund } from "./refund-policy";

describe("lastRefundableDate", () => {
  it("is the day before with the default cutoff of 1", () => {
    expect(lastRefundableDate("2026-11-07", 1)).toBe("2026-11-06");
  });
  it("is the session day itself with a cutoff of 0", () => {
    expect(lastRefundableDate("2026-11-07", 0)).toBe("2026-11-07");
  });
  it("crosses month boundaries", () => {
    expect(lastRefundableDate("2026-12-01", 2)).toBe("2026-11-29");
  });
});

describe("ukLocalDate", () => {
  it("uses BST in summer: 23:30 UTC is already tomorrow in the UK", () => {
    expect(ukLocalDate("2026-10-24T23:30:00.000Z")).toBe("2026-10-25");
  });
  it("uses GMT in winter", () => {
    expect(ukLocalDate("2026-11-24T23:30:00.000Z")).toBe("2026-11-24");
  });
});

describe("parentRefund", () => {
  const base = { sessionDate: "2026-11-07", cutoffDays: 1, amountPence: 950, refundedPence: 0 };

  it("refunds in full up to 23:59 UK time on the day before", () => {
    expect(parentRefund({ ...base, nowIso: "2026-11-06T23:59:00.000Z" })).toEqual({ eligible: true, refundPence: 950, lastRefundableDate: "2026-11-06" });
  });
  it("refunds nothing on the session day", () => {
    expect(parentRefund({ ...base, nowIso: "2026-11-07T07:00:00.000Z" })).toEqual({ eligible: false, refundPence: 0, lastRefundableDate: "2026-11-06" });
  });
  it("applies BST: 23:30 UTC on the 24th is the 25th in the UK", () => {
    expect(parentRefund({ ...base, sessionDate: "2026-10-25", nowIso: "2026-10-24T23:30:00.000Z" }).eligible).toBe(false);
  });
  it("only refunds what hasn't already been refunded", () => {
    expect(parentRefund({ ...base, refundedPence: 350, nowIso: "2026-11-01T10:00:00.000Z" }).refundPence).toBe(600);
  });
});

describe("validateStaffRefund", () => {
  it("defaults to everything left", () => {
    expect(validateStaffRefund({ requestedPence: null, amountPence: 950, refundedPence: 350 })).toEqual({ ok: true, refundPence: 600 });
  });
  it("allows a partial refund (e.g. one child of two)", () => {
    expect(validateStaffRefund({ requestedPence: 350, amountPence: 950, refundedPence: 0 })).toEqual({ ok: true, refundPence: 350 });
  });
  it("refuses more than is left", () => {
    expect(validateStaffRefund({ requestedPence: 700, amountPence: 950, refundedPence: 350 })).toEqual({
      ok: false,
      error: "You can refund at most £6.00 on this booking.",
    });
  });
  it("refuses zero, and anything when fully refunded", () => {
    expect(validateStaffRefund({ requestedPence: 0, amountPence: 950, refundedPence: 0 }).ok).toBe(false);
    expect(validateStaffRefund({ requestedPence: null, amountPence: 950, refundedPence: 950 })).toEqual({
      ok: false,
      error: "This booking has already been fully refunded.",
    });
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -- refund-policy`
Expected: FAIL, cannot resolve `./refund-policy`.

- [ ] **Step 3: Implement**

```ts
// lib/payments/refund-policy.ts
import { formatPence } from "@/lib/money";
import { utcIsoToUkLocalParts } from "@/lib/uk-time";

// Events carry no time of day (all_day, stored at midnight), so the cutoff
// is a whole number of days, judged on the UK calendar date — never UTC,
// or a parent cancelling at 00:30 BST would be judged a day early.
export function lastRefundableDate(sessionDate: string, cutoffDays: number): string {
  const d = new Date(`${sessionDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - cutoffDays);
  return d.toISOString().slice(0, 10);
}

export function ukLocalDate(nowIso: string): string {
  return utcIsoToUkLocalParts(nowIso).date;
}

export function parentRefund(input: {
  sessionDate: string;
  cutoffDays: number;
  nowIso: string;
  amountPence: number;
  refundedPence: number;
}): { eligible: boolean; refundPence: number; lastRefundableDate: string } {
  const last = lastRefundableDate(input.sessionDate, input.cutoffDays);
  const eligible = ukLocalDate(input.nowIso) <= last;
  const remaining = Math.max(input.amountPence - input.refundedPence, 0);
  return { eligible, refundPence: eligible ? remaining : 0, lastRefundableDate: last };
}

export function validateStaffRefund(input: {
  requestedPence: number | null;
  amountPence: number;
  refundedPence: number;
}): { ok: false; error: string } | { ok: true; refundPence: number } {
  const remaining = Math.max(input.amountPence - input.refundedPence, 0);
  if (remaining === 0) return { ok: false, error: "This booking has already been fully refunded." };
  const requested = input.requestedPence ?? remaining;
  if (requested <= 0) return { ok: false, error: "Enter an amount greater than zero." };
  if (requested > remaining) return { ok: false, error: `You can refund at most ${formatPence(remaining)} on this booking.` };
  return { ok: true, refundPence: requested };
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- refund-policy`
Expected: PASS. (`utcIsoToUkLocalParts` uses `Intl` with `Europe/London`, which Node 20's full ICU supports.)

- [ ] **Step 5: Commit**

```bash
git add lib/payments/refund-policy.ts lib/payments/refund-policy.test.ts
git commit -m "Add day-based, UK-time refund cutoff policy"
```

---

### Task 2: Schema for refunds and staff cancellation

**Files:**
- Create: `supabase/migrations/0030_refunds.sql`
- Create: `supabase/migrations/0030_refunds.verify.sql`
- Modify: `supabase/migrations/README.md`
- Modify: `lib/supabase/types.ts`

**Interfaces:**
- Produces (TypeScript):
  - `ClubRow` + `refund_cutoff_days: number`
  - `RefundReason = "parent_cancelled" | "session_cancelled" | "staff_refund" | "late_payment"`; `RefundStatus = "pending" | "succeeded" | "failed"`
  - `BookingRefundRow { id; booking_id; stripe_refund_id: string; amount_pence: number; reason: RefundReason; status: RefundStatus; created_by: string | null; created_at; updated_at }`
  - `cancel_booking` Returns `{ cancelled_event_id: string; promoted_booking_id: string | null; promoted_attendee_id: string | null; prev_status: SignupStatus; was_paid: boolean; event_paid: boolean }[]`
  - `staff_cancel_booking: { Args: { p_booking_id: string }; Returns: { cancelled_event_id: string; prev_status: SignupStatus; was_paid: boolean }[] }`
  - `cancel_session: { Args: { p_event_id: string }; Returns: { booking_id: string; attendee_id: string; was_paid: boolean }[] }`
  - `booking_refunded_pence: { Args: { p_booking_id: string }; Returns: number }`
  - `can_manage_event: { Args: { p_event_id: string }; Returns: boolean }`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0030_refunds.sql
-- Members centre, part 3: cancellations and refunds (spec:
-- docs/superpowers/specs/2026-10-03-members-centre-paid-sessions-design.md).
-- Lifts 0029's "paid bookings can't be self-cancelled" block now that
-- there's a refund path, and adds staff-side cancellation. Every Stripe
-- refund is recorded in booking_refunds by lib/payments/refunds.ts; the
-- Stripe webhook settles its status.

alter table clubs add column refund_cutoff_days integer not null default 1
  check (refund_cutoff_days >= 0 and refund_cutoff_days <= 14);

create type refund_reason as enum ('parent_cancelled', 'session_cancelled', 'staff_refund', 'late_payment');
create type refund_status as enum ('pending', 'succeeded', 'failed');

create table booking_refunds (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings (id) on delete restrict,
  stripe_refund_id text not null unique,
  amount_pence integer not null check (amount_pence > 0),
  reason refund_reason not null,
  status refund_status not null default 'pending',
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index booking_refunds_booking_id_idx on booking_refunds (booking_id);
create trigger booking_refunds_set_updated_at before update on booking_refunds
  for each row execute function set_updated_at();

alter table booking_refunds enable row level security;

create policy "parents can read refunds on their bookings"
  on booking_refunds for select
  using (exists (select 1 from bookings where bookings.id = booking_refunds.booking_id and bookings.attendee_id = auth.uid()));
create policy "admins can read all refunds"
  on booking_refunds for select using (is_admin());
create policy "club staff can read refunds for their club's events"
  on booking_refunds for select
  using (exists (
    select 1 from bookings b join events e on e.id = b.event_id
    where b.id = booking_refunds.booking_id and e.club_id is not null and is_club_staff(e.club_id)
  ));
-- Writes: service role only (lib/payments/refunds.ts), so no write policies.

-- ---------- helpers ----------
create function booking_refunded_pence(p_booking_id uuid) returns integer as $$
  select coalesce(sum(amount_pence), 0)::integer from booking_refunds
  where booking_id = p_booking_id and status <> 'failed';
$$ language sql stable security definer set search_path = public;

grant execute on function booking_refunded_pence(uuid) to authenticated, service_role;

-- Who may act on an event's bookings: admins, the event's creator, or
-- staff of its club. One definition shared by the functions below and by
-- canManageEvent() in lib/auth.ts.
create function can_manage_event(p_event_id uuid) returns boolean as $$
  select is_admin() or exists (
    select 1 from events e
    where e.id = p_event_id
      and (e.created_by = auth.uid() or (e.club_id is not null and is_club_staff(e.club_id)))
  );
$$ language sql stable security definer set search_path = public;

grant execute on function can_manage_event(uuid) to authenticated;

-- ---------- cancel_booking(): paid-aware, reports what was paid ----------
-- Return shape grows, so drop + create (CREATE OR REPLACE can't change a
-- function's OUT columns).
drop function cancel_booking(uuid);

create function cancel_booking(p_booking_id uuid)
returns table (
  cancelled_event_id uuid,
  promoted_booking_id uuid,
  promoted_attendee_id uuid,
  prev_status signup_status,
  was_paid boolean,
  event_paid boolean
) as $$
declare
  v_event_id uuid;
  v_attendee_id uuid;
  v_prev_status signup_status;
  v_paid_at timestamptz;
  v_event_paid boolean;
  v_capacity integer;
  v_freed integer;
  v_candidate record;
  v_promoted_booking_id uuid;
  v_promoted_attendee_id uuid;
begin
  select event_id, attendee_id, status, paid_at into v_event_id, v_attendee_id, v_prev_status, v_paid_at
    from bookings where id = p_booking_id;

  if v_event_id is null then
    raise exception 'Booking not found.';
  end if;
  if v_attendee_id <> auth.uid() then
    raise exception 'Not authorised to cancel this booking.';
  end if;

  select booking_capacity, paid into v_capacity, v_event_paid from events where id = v_event_id;

  if v_prev_status = 'cancelled' then
    return query select v_event_id, null::uuid, null::uuid, v_prev_status, false, v_event_paid;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtext(v_event_id::text));

  update bookings set status = 'cancelled', hold_expires_at = null where id = p_booking_id;

  if v_prev_status = 'confirmed' and not v_event_paid and v_capacity is not null then
    v_freed := v_capacity - event_active_people(v_event_id);
    for v_candidate in
      select b.id as booking_id, b.attendee_id, count(bp.id) as people_count
      from bookings b
      join booking_people bp on bp.booking_id = b.id
      where b.event_id = v_event_id and b.status = 'waitlisted'
      group by b.id, b.attendee_id, b.created_at
      order by b.created_at asc
    loop
      if v_candidate.people_count <= v_freed then
        update bookings set status = 'confirmed' where id = v_candidate.booking_id;
        v_promoted_booking_id := v_candidate.booking_id;
        v_promoted_attendee_id := v_candidate.attendee_id;
        exit;
      end if;
    end loop;
  end if;

  return query select v_event_id, v_promoted_booking_id, v_promoted_attendee_id, v_prev_status, (v_paid_at is not null), v_event_paid;
end;
$$ language plpgsql security definer set search_path = public;

revoke execute on function cancel_booking(uuid) from public, anon;
grant execute on function cancel_booking(uuid) to authenticated;

-- ---------- staff_cancel_booking() ----------
-- Coach/admin cancels one family's booking. No waitlist promotion here: the
-- action layer handles notifying (paid) or the coach re-offers the place.
create function staff_cancel_booking(p_booking_id uuid)
returns table (cancelled_event_id uuid, prev_status signup_status, was_paid boolean) as $$
declare
  v_event_id uuid;
  v_prev_status signup_status;
  v_paid_at timestamptz;
begin
  select event_id, status, paid_at into v_event_id, v_prev_status, v_paid_at from bookings where id = p_booking_id;
  if v_event_id is null then
    raise exception 'Booking not found.';
  end if;
  if not can_manage_event(v_event_id) then
    raise exception 'Not authorised for this session.';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_event_id::text));
  update bookings set status = 'cancelled', hold_expires_at = null where id = p_booking_id and status <> 'cancelled';
  return query select v_event_id, v_prev_status, (v_paid_at is not null);
end;
$$ language plpgsql security definer set search_path = public;

revoke execute on function staff_cancel_booking(uuid) from public, anon;
grant execute on function staff_cancel_booking(uuid) to authenticated;

-- ---------- cancel_session() ----------
-- Weather, coach illness, venue lost: mark the session cancelled and every
-- active booking with it, returning them so the caller can refund paid ones
-- and email everyone. The event row stays (status 'cancelled' already
-- renders as cancelled across the site); it is never deleted.
create function cancel_session(p_event_id uuid)
returns table (booking_id uuid, attendee_id uuid, was_paid boolean) as $$
begin
  if not can_manage_event(p_event_id) then
    raise exception 'Not authorised for this session.';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_event_id::text));
  update events set status = 'cancelled' where id = p_event_id;

  return query
    with cancelled as (
      update bookings set status = 'cancelled', hold_expires_at = null
      where event_id = p_event_id and status in ('confirmed', 'waitlisted', 'pending_payment')
      returning id, bookings.attendee_id, paid_at
    )
    select cancelled.id, cancelled.attendee_id, (cancelled.paid_at is not null) from cancelled;
end;
$$ language plpgsql security definer set search_path = public;

revoke execute on function cancel_session(uuid) from public, anon;
grant execute on function cancel_session(uuid) to authenticated;
```

- [ ] **Step 2: Verification script**

```sql
-- supabase/migrations/0030_refunds.verify.sql
-- Throwaway check, NOT a migration. auth.uid() is null in the SQL editor,
-- so this checks the permission refusals and the pure helpers; the happy
-- paths are verified through the app (Tasks 4–5).
do $$
declare
  v_parent uuid := gen_random_uuid();
  v_club uuid;
  v_event uuid;
  v_booking uuid;
  v_caught boolean;
begin
  insert into auth.users (id, email, raw_user_meta_data) values (v_parent, 'scratch-0030@example.com', '{"role":"attendee"}'::jsonb);
  insert into clubs (name, location) values ('SCRATCH CLUB 0030', 'Nowhere') returning id into v_club;
  assert (select refund_cutoff_days from clubs where id = v_club) = 1, 'default cutoff should be 1 day';

  insert into events (title, discipline, kind, club_id, start_datetime, venue_name, organiser_url, region, approved, bookable, paid)
  values ('SCRATCH 0030', 'road', 'training', v_club, now() + interval '7 days', 'Test', 'https://example.com', 'devon', true, true, true)
  returning id into v_event;
  select booking_id into v_booking from create_booking(v_event, v_parent, '[{"name":"K","age_category":"u10","price_pence":950}]'::jsonb, 36);
  perform confirm_paid_booking(v_booking, 'cs_test_0030', 'pi_test_0030');

  insert into booking_refunds (booking_id, stripe_refund_id, amount_pence, reason, status) values
    (v_booking, 're_test_a', 350, 'staff_refund', 'succeeded'),
    (v_booking, 're_test_b', 100, 'staff_refund', 'failed');
  assert booking_refunded_pence(v_booking) = 350, 'failed refunds must not count as refunded';

  v_caught := false;
  begin perform cancel_session(v_event); exception when raise_exception then v_caught := true; end;
  assert v_caught, 'anonymous caller must not cancel a session';

  v_caught := false;
  begin perform staff_cancel_booking(v_booking); exception when raise_exception then v_caught := true; end;
  assert v_caught, 'anonymous caller must not staff-cancel';

  delete from booking_refunds where booking_id = v_booking;
  delete from bookings where event_id = v_event;
  delete from events where id = v_event;
  delete from clubs where id = v_club;
  delete from auth.users where id = v_parent;
  raise notice '0030 verification passed';
end $$;
```

- [ ] **Step 3: Types and README**

Add the types listed under **Interfaces** to `lib/supabase/types.ts`, plus `booking_refunds: { Row: AsRecord<BookingRefundRow>; Insert: AsRecord<Partial<BookingRefundRow>>; Update: AsRecord<Partial<BookingRefundRow>>; Relationships: [] };` in Tables. Replace the `cancel_booking` Returns, and add `staff_cancel_booking`, `cancel_session`, `booking_refunded_pence`, `can_manage_event` to Functions.

Append to the migrations README table:

```
| `0030_refunds.sql` | Cancellations and refunds: `clubs.refund_cutoff_days` (default 1 = "by 23:59 the day before"), `booking_refunds` (every Stripe refund, `on delete restrict` so a refund trail can't vanish), `booking_refunded_pence()`, `can_manage_event()` (admin, creator, or club staff). Recreates `cancel_booking()` so paid bookings can be self-cancelled and the caller learns whether it was paid; adds `staff_cancel_booking()` and `cancel_session()` (marks the event cancelled and cancels every active booking), both permission-checked inside. |
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. The current `cancelBooking` only reads `promoted_booking_id` / `promoted_attendee_id` / `cancelled_event_id`, which the new return shape keeps. Task 4 rewrites it.

- [ ] **Step 5: Apply and verify (manual)**

Ask the user to run `0030_refunds.sql`, then `0030_refunds.verify.sql`.
Expected: `NOTICE: 0030 verification passed`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0030_refunds.sql supabase/migrations/0030_refunds.verify.sql supabase/migrations/README.md lib/supabase/types.ts
git commit -m "Add refund records and staff cancellation functions"
```

---

### Task 3: `issueRefund()` and refund emails

**Files:**
- Create: `lib/payments/refunds.ts`
- Create: `lib/email/cancellation.ts`
- Create: `lib/email/place-opened.ts`
- Create: `lib/payments/notify-waitlist.ts`
- Modify: `lib/stripe/webhook-handlers.ts` (late-payment refund via `issueRefund`; `refund.updated` / `refund.failed`)
- Modify: `lib/auth.ts` (`canManageEvent`)

**Interfaces:**
- Consumes: `validateStaffRefund`, `booking_refunded_pence`, `getStripe`.
- Produces:
  - `issueRefund(input: { bookingId: string; amountPence: number | null; reason: RefundReason; createdBy: string | null }): Promise<{ ok: true; refundedPence: number; status: RefundStatus } | { ok: false; error: string }>` (`amountPence: null` = everything left)
  - `canManageEvent(eventId: string): Promise<boolean>` (calls the `can_manage_event` RPC as the signed-in user)
  - `buildCancellationHtml(args: { eventTitle: string; sessionDateLabel: string; kind: "parent" | "session_cancelled" | "staff"; refundPence: number; lastRefundableDate: string | null; eventUrl: string }): string`
  - `buildPlaceOpenedHtml(args: { eventTitle: string; sessionDateLabel: string; eventUrl: string }): string`
  - `notifyWaitlistPlaceOpened(eventId: string): Promise<number>` (emails every waitlisted family, returns count)

- [ ] **Step 1: `issueRefund`**

```ts
// lib/payments/refunds.ts
import "server-only";
import * as Sentry from "@sentry/nextjs";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/server";
import { validateStaffRefund } from "./refund-policy";
import type { RefundReason, RefundStatus } from "@/lib/supabase/types";

function toRefundStatus(stripeStatus: string | null): RefundStatus {
  if (stripeStatus === "succeeded") return "succeeded";
  if (stripeStatus === "failed" || stripeStatus === "canceled") return "failed";
  return "pending";
}

// The only code that creates Stripe refunds. Callers authorise the actor
// first; this function enforces the money rules regardless of caller:
// the ceiling comes from the DB, never from the request.
export async function issueRefund(input: {
  bookingId: string;
  amountPence: number | null;
  reason: RefundReason;
  createdBy: string | null;
}): Promise<{ ok: true; refundedPence: number; status: RefundStatus } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("bookings")
    .select("id, amount_pence, paid_at, stripe_payment_intent_id, event:events!inner(club:clubs(stripe_account_id))")
    .eq("id", input.bookingId)
    .single();
  const booking = data as unknown as {
    id: string;
    amount_pence: number | null;
    paid_at: string | null;
    stripe_payment_intent_id: string | null;
    event: { club: { stripe_account_id: string | null } | null };
  } | null;

  if (!booking || !booking.paid_at || !booking.stripe_payment_intent_id || !booking.amount_pence) {
    return { ok: false, error: "This booking has no payment to refund." };
  }
  const accountId = booking.event.club?.stripe_account_id;
  if (!accountId) return { ok: false, error: "The club's Stripe account isn't connected." };

  const { data: refunded } = await admin.rpc("booking_refunded_pence", { p_booking_id: booking.id });
  const checked = validateStaffRefund({ requestedPence: input.amountPence, amountPence: booking.amount_pence, refundedPence: refunded ?? 0 });
  if (!checked.ok) return checked;

  try {
    // Key includes the already-refunded total, so a double-click dedupes
    // but a genuine second partial refund later gets a fresh key.
    const refund = await getStripe().refunds.create(
      {
        payment_intent: booking.stripe_payment_intent_id,
        amount: checked.refundPence,
        metadata: { booking_id: booking.id, reason: input.reason },
      },
      { stripeAccount: accountId, idempotencyKey: `refund-${booking.id}-${refunded ?? 0}-${checked.refundPence}` }
    );
    const status = toRefundStatus(refund.status);
    await admin.from("booking_refunds").upsert(
      {
        booking_id: booking.id,
        stripe_refund_id: refund.id,
        amount_pence: checked.refundPence,
        reason: input.reason,
        status,
        created_by: input.createdBy,
      },
      { onConflict: "stripe_refund_id", ignoreDuplicates: true }
    );
    return { ok: true, refundedPence: checked.refundPence, status };
  } catch (e) {
    Sentry.captureException(e, { tags: { operation: "issue_refund", reason: input.reason }, extra: { booking_id: booking.id } });
    return { ok: false, error: "Stripe couldn't process the refund. Try again, or refund from the Stripe dashboard." };
  }
}
```

- [ ] **Step 2: Emails and waitlist notification**

```ts
// lib/email/cancellation.ts
import "server-only";
import { formatPence } from "@/lib/money";
import { fmtDay } from "@/lib/format";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function buildCancellationHtml(args: {
  eventTitle: string;
  sessionDateLabel: string;
  kind: "parent" | "session_cancelled" | "staff";
  refundPence: number;
  lastRefundableDate: string | null;
  eventUrl: string;
}): string {
  const headline =
    args.kind === "session_cancelled" ? "This session has been cancelled." : "Your booking has been cancelled.";
  const intro =
    args.kind === "session_cancelled"
      ? "Sorry, the club has had to cancel this session."
      : args.kind === "staff"
        ? "The club has cancelled your booking for this session."
        : "You've cancelled your booking.";
  const cutoff = args.lastRefundableDate ? fmtDay(args.lastRefundableDate) : null;
  const money =
    args.refundPence > 0
      ? `We've refunded <strong>${formatPence(args.refundPence)}</strong> to your card. It usually appears within 5–10 days.`
      : args.kind === "parent" && cutoff
        ? `This was after the refund cutoff (23:59 on ${cutoff.day} ${cutoff.mon}), so no refund is due. If something's gone wrong, reply to your coach.`
        : "";

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAFAF8;padding:40px 0;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">
      <tr><td style="font-family:Georgia,'Times New Roman',serif;font-weight:bold;font-size:15px;color:#111111;padding-bottom:32px;">SOUTH WEST KIDS CYCLING</td></tr>
      <tr><td style="font-family:-apple-system,Helvetica,Arial,sans-serif;font-size:11px;font-weight:bold;letter-spacing:0.1em;color:#E0102A;padding-bottom:14px;">CANCELLED</td></tr>
      <tr><td style="font-family:Georgia,'Times New Roman',serif;font-weight:bold;font-size:24px;line-height:1.2;color:#111111;padding-bottom:12px;">${headline}</td></tr>
      <tr><td style="font-family:-apple-system,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:#4A4A46;padding-bottom:20px;">
        <strong>${escapeHtml(args.eventTitle)}</strong> &middot; ${escapeHtml(args.sessionDateLabel)}<br/><br/>${intro} ${money}
      </td></tr>
      <tr><td><a href="${escapeHtml(args.eventUrl)}" style="display:inline-block;background:#111111;color:#FAFAF8;font-family:-apple-system,Helvetica,Arial,sans-serif;font-weight:bold;font-size:14px;text-decoration:none;padding:13px 26px;">Your bookings</a></td></tr>
    </table>
  </td></tr>
</table>
`;
}
```

```ts
// lib/email/place-opened.ts
import "server-only";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

// Paid sessions don't auto-promote (spec: "Waitlist for paid sessions"),
// so everyone waiting hears at once and the first to book gets it.
export function buildPlaceOpenedHtml(args: { eventTitle: string; sessionDateLabel: string; eventUrl: string }): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAFAF8;padding:40px 0;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">
      <tr><td style="font-family:Georgia,'Times New Roman',serif;font-weight:bold;font-size:15px;color:#111111;padding-bottom:32px;">SOUTH WEST KIDS CYCLING</td></tr>
      <tr><td style="font-family:Georgia,'Times New Roman',serif;font-weight:bold;font-size:24px;line-height:1.2;color:#111111;padding-bottom:12px;">A place has opened up.</td></tr>
      <tr><td style="font-family:-apple-system,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:#4A4A46;padding-bottom:20px;">
        <strong>${escapeHtml(args.eventTitle)}</strong> &middot; ${escapeHtml(args.sessionDateLabel)}<br/><br/>
        You're on the waitlist and a place has just come free. Everyone waiting has been told, so the first family to book gets it.
      </td></tr>
      <tr><td><a href="${escapeHtml(args.eventUrl)}" style="display:inline-block;background:#111111;color:#FAFAF8;font-family:-apple-system,Helvetica,Arial,sans-serif;font-weight:bold;font-size:14px;text-decoration:none;padding:13px 26px;">Book now</a></td></tr>
    </table>
  </td></tr>
</table>
`;
}
```

```ts
// lib/payments/notify-waitlist.ts
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/resend";
import { buildPlaceOpenedHtml } from "@/lib/email/place-opened";
import { fmtDay } from "@/lib/format";

export async function notifyWaitlistPlaceOpened(eventId: string): Promise<number> {
  const admin = createAdminClient();
  const [{ data: event }, { data: waiting }] = await Promise.all([
    admin.from("events").select("id, title, start_datetime, status").eq("id", eventId).single(),
    admin.from("bookings").select("attendee:attendees(email)").eq("event_id", eventId).eq("status", "waitlisted"),
  ]);
  if (!event || event.status === "cancelled" || !waiting) return 0;

  const emails = [...new Set((waiting as unknown as { attendee: { email: string } }[]).map((w) => w.attendee.email))];
  const f = fmtDay(event.start_datetime.slice(0, 10));
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.southwestkidscycling.uk";
  let sent = 0;
  for (const to of emails) {
    try {
      await sendEmail({
        to,
        subject: `A place has opened: ${event.title}`,
        html: buildPlaceOpenedHtml({ eventTitle: event.title, sessionDateLabel: `${f.day} ${f.mon}`, eventUrl: `${siteUrl}/events/${event.id}` }),
      });
      sent++;
    } catch {
      // Best-effort per recipient.
    }
  }
  return sent;
}
```

Append to `lib/auth.ts`:

```ts
// Same rule as the can_manage_event() SQL function (admin, the event's
// creator, or staff of its club), evaluated by Postgres so UI and RLS agree.
export async function canManageEvent(eventId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("can_manage_event", { p_event_id: eventId });
  return data === true;
}
```

Replace the inlined ownership checks from Plan 1 (`app/organiser/events/[id]/attendees/page.tsx` and `messageAttendees`) with `await canManageEvent(id)` (keep computing `isClubStaff` on the page for `canAssignGroups`).

- [ ] **Step 3: Webhook uses `issueRefund` and settles refunds**

In `lib/stripe/webhook-handlers.ts`:
- in `onCheckoutCompleted`'s `outcome === "refund"` branch, replace the direct `getStripe().refunds.create(...)` with
  `const r = await issueRefund({ bookingId, amountPence: null, reason: "late_payment", createdBy: null }); if (!r.ok) throw new Error(r.error);`.
  For a `not_found` booking (no row to record against), keep a direct refund but route it through a new exported `refundUnknownPayment(paymentIntentId, accountId)` in `lib/payments/refunds.ts` (same idempotency key `refund-late-${paymentIntentId}`, logs to Sentry). It's the one documented exception to "issueRefund only", because there's no booking to attach a record to;
- add a refund-status handler:

```ts
async function onRefundUpdated(refund: Stripe.Refund) {
  const admin = createAdminClient();
  const status = refund.status === "succeeded" ? "succeeded" : refund.status === "failed" || refund.status === "canceled" ? "failed" : "pending";
  const { data: row } = await admin.from("booking_refunds").update({ status }).eq("stripe_refund_id", refund.id).select("booking_id, amount_pence").maybeSingle();
  if (status === "failed" && row && process.env.ADMIN_NOTIFICATION_EMAIL) {
    try {
      await sendEmail({
        to: process.env.ADMIN_NOTIFICATION_EMAIL,
        subject: "A session refund failed",
        html: `<p>Stripe reports refund <code>${refund.id}</code> (${(row.amount_pence / 100).toFixed(2)} GBP) for booking <code>${row.booking_id}</code> failed${refund.failure_reason ? `: ${refund.failure_reason}` : ""}. The family has not been refunded. Check the club's Stripe dashboard.</p>`,
      });
    } catch {}
  }
}
```

  and in `handleStripeEvent`'s switch:

```ts
    case "refund.updated":
    case "refund.failed":
      await onRefundUpdated(event.data.object);
      return;
```

  (If the installed SDK's `Stripe.Event` union doesn't include `"refund.failed"`, drop that case. `refund.updated` covers the transition.)

In the Stripe dashboard (test and, later, live), add `refund.updated` and `refund.failed` to the Connect webhook endpoint's events.

- [ ] **Step 4: Verify and commit**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: clean.

```bash
git add lib/payments/refunds.ts lib/payments/notify-waitlist.ts lib/email/cancellation.ts lib/email/place-opened.ts lib/stripe/webhook-handlers.ts lib/auth.ts app/organiser lib/actions/bookings.ts
git commit -m "Route every refund through one recorded, idempotent helper"
```

---

### Task 4: Parents cancel paid bookings with automatic refund

**Files:**
- Modify: `lib/actions/bookings.ts` (`cancelBooking`; add `getCancellationQuote`)
- Modify: `components/events/MyBookingsList.tsx`
- Modify: `lib/data.ts` (`MyBooking` gains `refunded_pence`)

**Interfaces:**
- Consumes: `cancel_booking` (new shape), `parentRefund`, `issueRefund`, `notifyWaitlistPlaceOpened`, `buildCancellationHtml`.
- Produces:
  - `getCancellationQuote(bookingId: string): Promise<{ refundPence: number; eligible: boolean; lastRefundableDate: string } | { error: string }>`
  - `cancelBooking(bookingId: string): Promise<{ error?: string; refundedPence?: number }>`

- [ ] **Step 1: Server actions**

Add a shared loader and the quote to `lib/actions/bookings.ts` (imports: `parentRefund`, `issueRefund`, `notifyWaitlistPlaceOpened`, `buildCancellationHtml`, `fmtDay`):

```ts
async function loadRefundContext(bookingId: string) {
  const supabase = await createClient(); // RLS: only the parent's own booking is visible
  const { data } = await supabase
    .from("bookings")
    .select("id, status, amount_pence, paid_at, event:events!inner(id, title, start_datetime, club:clubs(refund_cutoff_days))")
    .eq("id", bookingId)
    .maybeSingle();
  if (!data) return null;
  const { data: refunded } = await supabase.rpc("booking_refunded_pence", { p_booking_id: bookingId });
  const b = data as unknown as {
    id: string;
    status: string;
    amount_pence: number | null;
    paid_at: string | null;
    event: { id: string; title: string; start_datetime: string; club: { refund_cutoff_days: number } | null };
  };
  return { booking: b, refundedPence: refunded ?? 0 };
}

export async function getCancellationQuote(
  bookingId: string
): Promise<{ refundPence: number; eligible: boolean; lastRefundableDate: string } | { error: string }> {
  const ctx = await loadRefundContext(bookingId);
  if (!ctx) return { error: "Booking not found." };
  if (!ctx.booking.paid_at) return { refundPence: 0, eligible: true, lastRefundableDate: ctx.booking.event.start_datetime.slice(0, 10) };
  return parentRefund({
    sessionDate: ctx.booking.event.start_datetime.slice(0, 10),
    cutoffDays: ctx.booking.event.club?.refund_cutoff_days ?? 1,
    nowIso: new Date().toISOString(),
    amountPence: ctx.booking.amount_pence ?? 0,
    refundedPence: ctx.refundedPence,
  });
}
```

Rewrite `cancelBooking`:

```ts
export interface CancelBookingResult {
  error?: string;
  refundedPence?: number;
}

export async function cancelBooking(bookingId: string): Promise<CancelBookingResult> {
  const attendee = await getCurrentAttendee();
  if (!attendee) return { error: "Not signed in." };

  // Quote before cancelling: the decision is about when the parent pressed
  // Cancel, not when the refund call happens to finish.
  const quote = await getCancellationQuote(bookingId);
  if ("error" in quote) return { error: quote.error };
  const ctx = await loadRefundContext(bookingId);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cancel_booking", { p_booking_id: bookingId });
  if (error) return { error: error.message };
  const row = data?.[0];
  if (!row) return { error: "Couldn't cancel." };

  let refundedPence = 0;
  if (row.was_paid && quote.eligible && quote.refundPence > 0) {
    const r = await issueRefund({ bookingId, amountPence: quote.refundPence, reason: "parent_cancelled", createdBy: null });
    if (r.ok) refundedPence = r.refundedPence;
    else Sentry.captureMessage("Parent cancellation refund failed", { level: "error", tags: { booking_id: bookingId } });
  }

  if (ctx && row.prev_status !== "cancelled") {
    const f = fmtDay(ctx.booking.event.start_datetime.slice(0, 10));
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
    try {
      await sendEmail({
        to: attendee.email,
        subject: `Cancelled: ${ctx.booking.event.title}`,
        html: buildCancellationHtml({
          eventTitle: ctx.booking.event.title,
          sessionDateLabel: `${f.day} ${f.mon}`,
          kind: "parent",
          refundPence: refundedPence,
          lastRefundableDate: row.was_paid ? quote.lastRefundableDate : null,
          eventUrl: `${siteUrl}/my-events`,
        }),
      });
    } catch {}
  }

  if (row.event_paid && (row.prev_status === "confirmed" || row.prev_status === "pending_payment")) {
    await notifyWaitlistPlaceOpened(row.cancelled_event_id);
  }

  // Free sessions: the existing auto-promotion email, unchanged apart from
  // reading `row` instead of the old `promoted` variable.
  if (row.promoted_booking_id && row.promoted_attendee_id) {
    const admin = createAdminClient();
    const [{ data: promotedAttendee }, { data: promotedEvent }] = await Promise.all([
      admin.from("attendees").select("email").eq("id", row.promoted_attendee_id).single(),
      admin.from("events").select("*").eq("id", row.cancelled_event_id).single(),
    ]);
    if (promotedAttendee && promotedEvent) {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
      const { data: linkData } = await admin.auth.admin.generateLink({
        type: "magiclink",
        email: (promotedAttendee as { email: string }).email,
        options: { redirectTo: `${siteUrl}/auth/confirm?next=/my-events` },
      });
      try {
        await sendEmail({
          to: (promotedAttendee as { email: string }).email,
          subject: `You're in: ${(promotedEvent as EventRow).title}`,
          html: buildWaitlistPromotedHtml(promotedEvent as EventRow, linkData?.properties?.action_link ?? `${siteUrl}/my-events/login`),
        });
      } catch {}
    }
  }

  return { refundedPence };
}
```

This replaces the old `cancelBooking` entirely (its promotion-email block now lives at the end, shown above). Import `* as Sentry from "@sentry/nextjs"` if not already imported.

Add `refunded_pence` to `MyBooking`: in `getMyBookings`, select `refunds:booking_refunds(amount_pence, status)` and map `refunded_pence = sum(non-failed)`.

- [ ] **Step 2: UI**

In `components/events/MyBookingsList.tsx`:
- remove Plan 2's "Contact your coach to cancel" span; paid confirmed bookings get the normal Cancel button again;
- `handleCancel(id)` first asks for a quote and words the confirm dialog from it:

```tsx
  async function handleCancel(b: MyBooking) {
    let message = "Cancel this booking?";
    if (b.paid_at) {
      const q = await getCancellationQuote(b.id);
      if ("error" in q) {
        setErrors((prev) => ({ ...prev, [b.id]: q.error }));
        return;
      }
      const cutoff = fmtDay(q.lastRefundableDate);
      message = q.eligible
        ? `Cancel this booking? You'll be refunded ${formatPence(q.refundPence)} to your card.`
        : `Cancel this booking? It's after the refund cutoff (23:59 on ${cutoff.day} ${cutoff.mon}), so you won't be refunded. Your child's place will be offered to families on the waitlist.`;
    }
    if (!confirm(message)) return;
    setBusyIds((prev) => new Set(prev).add(b.id));
    const result = await cancelBooking(b.id);
    if (result.error) {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(b.id);
        return next;
      });
      setErrors((prev) => ({ ...prev, [b.id]: result.error! }));
      return;
    }
    router.refresh();
  }
```

  (Change the button's `onClick` to `handleCancel(b)`.)
- under a paid booking that has refunds, show `REFUNDED £x.xx`.

- [ ] **Step 3: Verify (manual, preview, Stripe test mode)**

Run: `npm test && npx tsc --noEmit && npm run lint`. Expected: clean.

1. Make a paid test session **8 days out** and book it (£3.50). Cancel. Expected: the confirm says "You'll be refunded £3.50". After confirming: cancellation email with £3.50 refunded; a `booking_refunds` row (`parent_cancelled`, `succeeded`); a refund visible in the club's Stripe test dashboard.
2. Make a paid test session **today** and book it. Cancel. Expected: the confirm mentions the cutoff and no refund; the email says no refund is due; no `booking_refunds` row.
3. Fill a capacity-1 paid session with parent A; parent B joins the waitlist. A cancels. Expected: B gets "A place has opened up."
4. Free session (unchanged): cancellation still auto-promotes the waitlisted family and sends "You're in".

- [ ] **Step 4: Commit**

```bash
git add lib/actions/bookings.ts components/events/MyBookingsList.tsx lib/data.ts
git commit -m "Let parents cancel paid bookings with an automatic refund before the cutoff"
```

---

### Task 5: Coach refunds and cancel-session

**Files:**
- Create: `lib/actions/staff-refunds.ts`
- Create: `components/events/BookingMoneyControls.tsx`
- Create: `components/events/CancelSessionButton.tsx`
- Modify: `components/events/AttendeesList.tsx` (render `BookingMoneyControls` per booking)
- Modify: `app/organiser/events/[id]/attendees/page.tsx`, `app/admin/events/[id]/attendees/page.tsx` (render `CancelSessionButton`)
- Modify: `lib/data.ts` (`EventBooking` gains `refundedPence`)

**Interfaces:**
- Consumes: `canManageEvent`, `issueRefund`, `poundsToPence`, `staff_cancel_booking`, `cancel_session`, `notifyWaitlistPlaceOpened`, `buildCancellationHtml`.
- Produces:
  - `staffRefundBooking(bookingId: string, amountPounds: string): Promise<{ error?: string; refundedPence?: number }>` (blank = everything left)
  - `staffCancelBooking(bookingId: string, refund: boolean): Promise<{ error?: string; refundedPence?: number }>`
  - `cancelSessionAndRefund(eventId: string): Promise<{ error?: string; cancelled?: number; refundedPence?: number; refundFailures?: number }>`

- [ ] **Step 1: Actions**

```ts
// lib/actions/staff-refunds.ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { canManageEvent, getCurrentProfile } from "@/lib/auth";
import { issueRefund } from "@/lib/payments/refunds";
import { notifyWaitlistPlaceOpened } from "@/lib/payments/notify-waitlist";
import { poundsToPence } from "@/lib/money";
import { sendEmail } from "@/lib/email/resend";
import { buildCancellationHtml } from "@/lib/email/cancellation";
import { fmtDay } from "@/lib/format";

async function eventIdForBooking(bookingId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin.from("bookings").select("event_id").eq("id", bookingId).maybeSingle();
  return data?.event_id ?? null;
}

function revalidateRoster(eventId: string) {
  revalidatePath(`/organiser/events/${eventId}/attendees`);
  revalidatePath(`/admin/events/${eventId}/attendees`);
}

async function emailFamily(bookingId: string, kind: "staff" | "session_cancelled", refundPence: number) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("bookings")
    .select("attendee:attendees(email), event:events(title, start_datetime)")
    .eq("id", bookingId)
    .single();
  const b = data as unknown as { attendee: { email: string }; event: { title: string; start_datetime: string } } | null;
  if (!b) return;
  const f = fmtDay(b.event.start_datetime.slice(0, 10));
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.southwestkidscycling.uk";
  try {
    await sendEmail({
      to: b.attendee.email,
      subject: kind === "session_cancelled" ? `Session cancelled: ${b.event.title}` : `Booking cancelled: ${b.event.title}`,
      html: buildCancellationHtml({ eventTitle: b.event.title, sessionDateLabel: `${f.day} ${f.mon}`, kind, refundPence, lastRefundableDate: null, eventUrl: `${siteUrl}/my-events` }),
    });
  } catch {}
}

export async function staffRefundBooking(bookingId: string, amountPounds: string): Promise<{ error?: string; refundedPence?: number }> {
  const eventId = await eventIdForBooking(bookingId);
  if (!eventId || !(await canManageEvent(eventId))) return { error: "Not authorised for this session." };

  let amountPence: number | null = null;
  if (amountPounds.trim()) {
    amountPence = poundsToPence(amountPounds);
    if (amountPence === null) return { error: "Enter an amount like 3.50, or leave it blank to refund everything left." };
  }

  const profile = await getCurrentProfile();
  const r = await issueRefund({ bookingId, amountPence, reason: "staff_refund", createdBy: profile?.id ?? null });
  if (!r.ok) return { error: r.error };
  revalidateRoster(eventId);
  return { refundedPence: r.refundedPence };
}

export async function staffCancelBooking(bookingId: string, refund: boolean): Promise<{ error?: string; refundedPence?: number }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("staff_cancel_booking", { p_booking_id: bookingId });
  if (error) return { error: error.message };
  const row = data?.[0];
  if (!row) return { error: "Couldn't cancel." };

  let refundedPence = 0;
  if (refund && row.was_paid) {
    const profile = await getCurrentProfile();
    const r = await issueRefund({ bookingId, amountPence: null, reason: "staff_refund", createdBy: profile?.id ?? null });
    if (!r.ok) return { error: `Booking cancelled, but the refund failed: ${r.error}` };
    refundedPence = r.refundedPence;
  }

  if (row.prev_status !== "cancelled") {
    await emailFamily(bookingId, "staff", refundedPence);
    const admin = createAdminClient();
    const { data: event } = await admin.from("events").select("paid").eq("id", row.cancelled_event_id).single();
    if (event?.paid && row.prev_status === "confirmed") await notifyWaitlistPlaceOpened(row.cancelled_event_id);
  }

  revalidateRoster(row.cancelled_event_id);
  return { refundedPence };
}

// One click for weather/illness: everything is cancelled atomically in
// Postgres first, then each paid booking is refunded in full. A refund
// failure doesn't stop the rest; it's reported back so the coach knows to
// finish it from Stripe.
export async function cancelSessionAndRefund(eventId: string): Promise<{ error?: string; cancelled?: number; refundedPence?: number; refundFailures?: number }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cancel_session", { p_event_id: eventId });
  if (error) return { error: error.message };

  const profile = await getCurrentProfile();
  let refundedPence = 0;
  let refundFailures = 0;
  for (const b of data ?? []) {
    let refunded = 0;
    if (b.was_paid) {
      const r = await issueRefund({ bookingId: b.booking_id, amountPence: null, reason: "session_cancelled", createdBy: profile?.id ?? null });
      if (r.ok) refunded = r.refundedPence;
      else if (r.error !== "This booking has already been fully refunded.") refundFailures++;
    }
    refundedPence += refunded;
    await emailFamily(b.booking_id, "session_cancelled", refunded);
  }

  revalidateRoster(eventId);
  revalidatePath(`/events/${eventId}`);
  return { cancelled: data?.length ?? 0, refundedPence, refundFailures };
}
```

- [ ] **Step 2: UI**

```tsx
// components/events/BookingMoneyControls.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { staffCancelBooking, staffRefundBooking } from "@/lib/actions/staff-refunds";
import { formatPence } from "@/lib/money";

const btn: React.CSSProperties = { fontSize: 11, background: "none", border: "1px solid #D8D6D0", padding: "5px 10px", cursor: "pointer" };

export default function BookingMoneyControls({
  bookingId,
  amountPence,
  refundedPence,
  paid,
}: {
  bookingId: string;
  amountPence: number | null;
  refundedPence: number;
  paid: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const left = Math.max((amountPence ?? 0) - refundedPence, 0);

  async function run(fn: () => Promise<{ error?: string; refundedPence?: number }>) {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    setNote(r.error ?? (r.refundedPence ? `Refunded ${formatPence(r.refundedPence)}.` : "Done."));
    if (!r.error) router.refresh();
  }

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
      {paid && left > 0 && (
        <button
          type="button"
          className="mono"
          style={btn}
          disabled={busy}
          onClick={() => {
            const input = prompt(`Refund how much? Up to ${formatPence(left)}. Leave blank for the full ${formatPence(left)}.`, "");
            if (input === null) return;
            run(() => staffRefundBooking(bookingId, input));
          }}
        >
          Refund…
        </button>
      )}
      <button
        type="button"
        className="mono"
        style={{ ...btn, color: "#A13A2A" }}
        disabled={busy}
        onClick={() => {
          const refund = paid && left > 0 ? confirm(`Cancel this booking and refund ${formatPence(left)}? (Cancel = choose not to refund)`) : false;
          if (paid && left > 0 && !refund && !confirm("Cancel this booking WITHOUT a refund?")) return;
          if (!paid && !confirm("Cancel this booking?")) return;
          run(() => staffCancelBooking(bookingId, refund));
        }}
      >
        Cancel booking
      </button>
      {paid && refundedPence > 0 && <span className="mono" style={{ fontSize: 10.5, color: "#6B6B66" }}>REFUNDED {formatPence(refundedPence)}</span>}
      {note && <span style={{ fontSize: 12, color: "#4A4A46" }}>{note}</span>}
    </div>
  );
}
```

```tsx
// components/events/CancelSessionButton.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cancelSessionAndRefund } from "@/lib/actions/staff-refunds";
import { formatPence } from "@/lib/money";

export default function CancelSessionButton({ eventId, paid, familyCount }: { eventId: string; paid: boolean; familyCount: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function handle() {
    const msg = paid
      ? `Cancel this session for all ${familyCount} families and refund every payment in full? Stripe keeps its card fee on refunds, so the club pays that. This can't be undone.`
      : `Cancel this session and email all ${familyCount} families? This can't be undone.`;
    if (!confirm(msg)) return;
    setBusy(true);
    const r = await cancelSessionAndRefund(eventId);
    setBusy(false);
    if (r.error) return setResult(r.error);
    setResult(
      `Cancelled ${r.cancelled} booking${r.cancelled === 1 ? "" : "s"}${paid ? `, refunded ${formatPence(r.refundedPence ?? 0)}` : ""}.` +
        (r.refundFailures ? ` ${r.refundFailures} refund(s) failed. Finish them from the club's Stripe dashboard.` : "")
    );
    router.refresh();
  }

  return (
    <div style={{ marginTop: 40, paddingTop: 20, borderTop: "1px solid #E4E2DD" }}>
      <button type="button" onClick={handle} disabled={busy} style={{ background: "#A13A2A", color: "#FAFAF8", border: "none", padding: "11px 20px", fontWeight: 700, fontSize: 13, cursor: "pointer", opacity: busy ? 0.6 : 1 }}>
        {busy ? "Cancelling…" : paid ? "Cancel session & refund everyone" : "Cancel session"}
      </button>
      {result && <p style={{ fontSize: 13, marginTop: 10 }}>{result}</p>}
    </div>
  );
}
```

Wire up:
- `lib/data.ts`: `getBookingsForEvent` also selects `refunds:booking_refunds(amount_pence, status)` and maps `refundedPence` (sum of non-failed) onto `EventBooking`.
- `AttendeesList`: accept `eventPaid: boolean`. In the **booking** contact line area (render once per booking, on the booking's first person row), render `<BookingMoneyControls bookingId={booking.id} amountPence={booking.amountPence} refundedPence={booking.refundedPence} paid={!!booking.paidAt} />` when the viewer can manage the event (pass a `canManage` prop; both attendees pages already know it).
- Both attendees pages: below `MessageAttendeesForm`, render `{event.status !== "cancelled" && <CancelSessionButton eventId={id} paid={event.paid} familyCount={bookings.length} />}`, and pass `eventPaid={event.paid}` / `canManage` to `AttendeesList`. If `event.status === "cancelled"`, show "This session was cancelled." instead.

- [ ] **Step 3: Verify (manual, preview, Stripe test mode)**

Run: `npm test && npx tsc --noEmit && npm run lint`. Expected: clean.

1. Paid test session with two families (£9.50 for two children, and £3.50). As the coach: **Refund…** £3.50 on the first. Expected: "Refunded £3.50", `REFUNDED £3.50`, a `staff_refund` row. Try **Refund…** £7.00. Expected: "You can refund at most £6.00 on this booking."
2. **Cancel booking** on the second family and choose refund. Expected: cancelled, £3.50 refunded, "Booking cancelled" email.
3. Book again, then **Cancel session & refund everyone**. Expected: result line with totals; every family emailed "This session has been cancelled" with the amount; the event detail page and calendar show it as cancelled; `booking_refunds` rows with `session_cancelled`.
4. As an unrelated organiser, call `cancelSessionAndRefund(<id>)` (e.g. temporarily from a scratch page). Expected: "Not authorised for this session."
5. Book with Stripe's test card `4000 0000 0000 5126` (its refunds fail asynchronously), then **Refund…** it. Expected: "Refunded …" at first (Stripe accepts the refund as pending). Shortly after, the `booking_refunds` row moves to `failed` via webhook and the admin gets "A session refund failed".

- [ ] **Step 4: Commit**

```bash
git add lib/actions/staff-refunds.ts components/events/BookingMoneyControls.tsx components/events/CancelSessionButton.tsx components/events/AttendeesList.tsx app/organiser app/admin/events lib/data.ts
git commit -m "Let coaches refund bookings and cancel a session with refunds for everyone"
```

---

### Task 6: Club refund cutoff setting and docs

**Files:**
- Create: `lib/actions/club-refund-policy.ts`
- Create: `components/clubs/RefundCutoffForm.tsx`
- Modify: `app/organiser/clubs/[id]/payments/page.tsx`
- Modify: `app/events/[id]/page.tsx` (state the refund policy on paid sessions)
- Modify: `README.md`

**Interfaces:**
- Produces: `saveRefundCutoff(clubId: string, _prev: { error?: string; saved?: boolean }, formData: FormData): Promise<{ error?: string; saved?: boolean }>` (field `refund_cutoff_days`, integer 0–14)

- [ ] **Step 1: Setting**

```ts
// lib/actions/club-refund-policy.ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { canManageClub, getCurrentProfile } from "@/lib/auth";

// clubs has staff update RLS (0020: is_staff()), which is broader than
// "staff of this club", so canManageClub is the real gate for this field.
export async function saveRefundCutoff(clubId: string, _prev: { error?: string; saved?: boolean }, formData: FormData): Promise<{ error?: string; saved?: boolean }> {
  if (!(await canManageClub(await getCurrentProfile(), clubId))) return { error: "Not authorised for this club." };
  const days = Number(String(formData.get("refund_cutoff_days") ?? "").trim());
  if (!Number.isInteger(days) || days < 0 || days > 14) return { error: "Choose between 0 and 14 days." };

  const supabase = await createClient();
  const { error } = await supabase.from("clubs").update({ refund_cutoff_days: days }).eq("id", clubId);
  if (error) return { error: error.message };
  revalidatePath(`/organiser/clubs/${clubId}/payments`);
  return { saved: true };
}
```

```tsx
// components/clubs/RefundCutoffForm.tsx
"use client";

import { useActionState } from "react";
import { saveRefundCutoff } from "@/lib/actions/club-refund-policy";

export default function RefundCutoffForm({ clubId, days }: { clubId: string; days: number }) {
  const [state, formAction, pending] = useActionState(saveRefundCutoff.bind(null, clubId), {});
  return (
    <form action={formAction} style={{ marginTop: 32, maxWidth: 560 }}>
      <h2 className="disp" style={{ fontSize: 20, marginBottom: 6 }}>Refund policy</h2>
      <p style={{ fontSize: 13.5, color: "#4A4A46", marginBottom: 12 }}>
        Parents who cancel up to 23:59 this many days before a session are refunded automatically. 1 = &quot;by the day before&quot;, 0 = &quot;up to the end of the session day&quot;. Later cancellations aren&apos;t refunded automatically, but you can still refund them from the roster.
      </p>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input name="refund_cutoff_days" type="number" min={0} max={14} defaultValue={days} style={{ width: 80, border: "1px solid #D8D6D0", padding: "8px 10px", fontSize: 13 }} />
        <span style={{ fontSize: 13 }}>days before</span>
        <button type="submit" disabled={pending} className="mono" style={{ fontSize: 11.5, fontWeight: 700, border: "1px solid #111111", background: "none", padding: "7px 12px", cursor: "pointer" }}>Save</button>
      </div>
      {state.error && <p style={{ color: "#A13A2A", fontSize: 12.5, marginTop: 8 }}>{state.error}</p>}
      {state.saved && <p style={{ color: "#6B6B66", fontSize: 12.5, marginTop: 8 }}>Saved.</p>}
    </form>
  );
}
```

Render `<RefundCutoffForm clubId={id} days={club.refund_cutoff_days} />` on the payments page when `club.stripe_charges_enabled`.

On `app/events/[id]/page.tsx`, for `event.paid` sessions with a club, add under the signup box (fetch the club row with `getClubRowById`):

```tsx
          <p style={{ fontSize: 12.5, color: "#6B6B66", marginTop: 10 }}>
            Cancel by 23:59 {club.refund_cutoff_days === 0 ? "on the day" : club.refund_cutoff_days === 1 ? "the day before" : `${club.refund_cutoff_days} days before`} for a full refund.
          </p>
```

- [ ] **Step 2: README**

- In "Paid sessions (Stripe)": delete the "paid confirmed bookings can't be self-cancelled" line. Add **Refunds**: the day-based UK-date cutoff (`clubs.refund_cutoff_days`, set on the club's Payments page); `issueRefund()` as the single refund path with DB-derived ceilings and idempotency keys; `booking_refunds` and webhook settlement (`refund.updated`/`refund.failed`, admin alert on failure); parent cancel flow; coach Refund… / Cancel booking / Cancel session & refund everyone; paid-session waitlist = "place opened" email to all; Stripe keeps its fee on refunds.
- Add `refund.updated` and `refund.failed` to the documented webhook event list.

- [ ] **Step 3: Full check and commit**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build && npx playwright test`
Expected: all succeed.

Manual: set Mid Devon's cutoff to 2. A paid session 2 days out is no longer auto-refunded, one 3 days out still is, and the event page says "Cancel by 23:59 2 days before for a full refund."

```bash
git add lib/actions/club-refund-policy.ts components/clubs/RefundCutoffForm.tsx app/organiser app/events README.md
git commit -m "Let clubs set their refund cutoff and document refunds"
```

---

## After Plan 3

Add `refund.updated` / `refund.failed` to the **live** Connect webhook endpoint before deploying to production, then rehearse "Cancel session & refund everyone" once on preview in test mode with a coach watching, so the first real use (a wet Saturday) isn't the first time anyone has pressed it.

Next candidates, each needing its own spec: multi-session basket ("book the rest of term" in one Checkout, to cut Stripe's per-transaction fee on £3.50 sessions), Bacs Direct Debit (see the spec's "Later: Direct Debit"), per-group capacity.
