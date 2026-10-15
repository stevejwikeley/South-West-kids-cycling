# Members Centre, Plan 2: Stripe Payments for Club Sessions

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A club connects its own Stripe account. An organiser sets a session's signup section to **Paid**. Parents book their saved children, pay each child's group price through Stripe Checkout (with saved cards), and are confirmed by webhook. Parents can view and remove saved cards.

**Architecture:** Stripe Connect with **Standard** connected accounts and **direct charges**: every Customer, Checkout Session, PaymentIntent and Refund is created on the club's account (`{ stripeAccount }` request option), so money goes straight to the club and the platform takes no fee. A paid booking starts as `pending_payment` with a 36-minute hold that counts against capacity. Checkout expires after 31 minutes so it always closes first. One webhook endpoint (`/api/stripe/webhook`, "Events on connected accounts") confirms bookings, releases abandoned holds, and syncs account status. Pure decision logic (pricing, webhook outcome) is unit-tested; Stripe/Supabase I/O is verified manually in Stripe test mode on preview.

**Tech Stack:** Next.js 16 App Router (Server Actions + Route Handlers), Supabase, `stripe` (Node SDK, new dependency), Resend, Vitest.

**Spec:** [docs/superpowers/specs/2026-10-03-members-centre-paid-sessions-design.md](../specs/2026-10-03-members-centre-paid-sessions-design.md)

**Depends on:** [Plan 1](2026-10-03-members-centre-1-riders-groups.md) merged and `0027` applied.

## Global Constraints

- Everything in Plan 1's Global Constraints still applies (worktree, manual migrations, inline styles, best-effort email, per-person capacity, children's data handling).
- Migrations are **`0028`** (enum value only, in its own file, because `ALTER TYPE … ADD VALUE` can't be used in the same transaction, the same constraint `0006`/`0011`/`0023` worked around) and **`0029`**.
- **No card data in our code or DB**, ever. Stripe Checkout (hosted) only. Never build card inputs.
- Every Stripe call for a club passes `{ stripeAccount: club.stripe_account_id }`. A Stripe call without it would charge the platform account, which is a bug.
- Every Stripe *create* call that could be retried passes an `idempotencyKey` derived from our own ids (`checkout-<bookingId>`, `refund-late-<bookingId>`).
- Money is integer pence, currency `gbp`. Use `formatPence` (`lib/money.ts`) for display.
- Capacity counts `confirmed` people **plus** `pending_payment` people whose `hold_expires_at > now()`. Correctness must never depend on a webhook or cron arriving.
- Checkout expiry (**31 min**) < hold (**36 min**). Stripe's minimum `expires_at` is 30 minutes from creation.
- **Paid confirmed bookings cannot be self-cancelled** in this plan. Show "Contact your coach to cancel". Plan 3 lifts this together with refunds.
- The Free/Paid choice lives **inside** the existing signup section (`components/events/SignupSettings.tsx`). Don't add a separate paid toggle anywhere.
- Paid sessions require a signed-in parent (members centre). The guest form is never shown on a paid session.
- Use the Stripe SDK's default pinned API version (don't pass `apiVersion`). If a type in this plan doesn't match the installed SDK, check `node_modules/stripe/types/` rather than guessing.
- Test only with `sk_test_…` keys on preview. Preview shares the production database, so use a dedicated test session and delete it afterwards (Task 8's script).

---

### Task 1: Stripe SDK, pricing, and checkout constants

**Files:**
- Modify: `package.json` (`stripe` dependency)
- Create: `lib/stripe/server.ts`
- Create: `lib/payments/constants.ts`
- Create: `lib/payments/pricing.ts`
- Create: `lib/payments/pricing.test.ts`
- Modify: `README.md` (env var table)

**Interfaces:**
- Produces:
  - `getStripe(): Stripe` (server-only singleton; throws if `STRIPE_SECRET_KEY` unset)
  - `CHECKOUT_EXPIRY_MINUTES = 31`, `PAYMENT_HOLD_MINUTES = 36`
  - `PricedLine = { riderId: string; riderName: string; groupId: string; groupName: string; pricePence: number }`
  - `priceRiders(riders: { id: string; name: string }[], groupByRider: Record<string, string | null>, groups: { id: string; name: string; price_pence: number }[]): { ok: false; error: string } | { ok: true; lines: PricedLine[]; totalPence: number }`

- [ ] **Step 1: Install**

```bash
npm install stripe
```

- [ ] **Step 2: Write the failing pricing test**

```ts
// lib/payments/pricing.test.ts
import { describe, expect, it } from "vitest";
import { priceRiders } from "./pricing";

const groups = [
  { id: "g1", name: "Group 1", price_pence: 350 },
  { id: "g3", name: "Group 3", price_pence: 600 },
];

describe("priceRiders", () => {
  it("charges each child their group's price", () => {
    const r = priceRiders(
      [{ id: "r1", name: "Ada" }, { id: "r2", name: "Ben" }],
      { r1: "g1", r2: "g3" },
      groups
    );
    expect(r).toEqual({
      ok: true,
      totalPence: 950,
      lines: [
        { riderId: "r1", riderName: "Ada", groupId: "g1", groupName: "Group 1", pricePence: 350 },
        { riderId: "r2", riderName: "Ben", groupId: "g3", groupName: "Group 3", pricePence: 600 },
      ],
    });
  });

  it("needs a group for every child", () => {
    expect(priceRiders([{ id: "r1", name: "Ada" }], { r1: null }, groups)).toEqual({ ok: false, error: "Pick a group for Ada." });
  });

  it("refuses a group the club no longer offers", () => {
    expect(priceRiders([{ id: "r1", name: "Ada" }], { r1: "gone" }, groups)).toEqual({
      ok: false,
      error: "Ada's group is no longer offered. Ask the coach to move them.",
    });
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm test -- pricing`
Expected: FAIL, cannot resolve `./pricing`.

- [ ] **Step 4: Implement**

```ts
// lib/payments/constants.ts
// Checkout must always close before our hold does, so a parent can never
// pay for a place that has already been released to someone else. Stripe's
// minimum expires_at is 30 minutes; 31 leaves headroom for clock skew.
export const CHECKOUT_EXPIRY_MINUTES = 31;
export const PAYMENT_HOLD_MINUTES = 36;
```

```ts
// lib/payments/pricing.ts
export interface PricedLine {
  riderId: string;
  riderName: string;
  groupId: string;
  groupName: string;
  pricePence: number;
}

// Spec: a child pays the price of the group they're in. `groups` should be
// the club's *active* groups, so a retired group can't be charged.
export function priceRiders(
  riders: { id: string; name: string }[],
  groupByRider: Record<string, string | null>,
  groups: { id: string; name: string; price_pence: number }[]
): { ok: false; error: string } | { ok: true; lines: PricedLine[]; totalPence: number } {
  const lines: PricedLine[] = [];
  for (const rider of riders) {
    const groupId = groupByRider[rider.id];
    if (!groupId) return { ok: false, error: `Pick a group for ${rider.name}.` };
    const group = groups.find((g) => g.id === groupId);
    if (!group) return { ok: false, error: `${rider.name}'s group is no longer offered. Ask the coach to move them.` };
    lines.push({ riderId: rider.id, riderName: rider.name, groupId, groupName: group.name, pricePence: group.price_pence });
  }
  return { ok: true, lines, totalPence: lines.reduce((sum, l) => sum + l.pricePence, 0) };
}
```

```ts
// lib/stripe/server.ts
import "server-only";
import Stripe from "stripe";

let client: Stripe | null = null;

// Platform key. Every call that acts for a club must also pass
// { stripeAccount } — see the plan's Global Constraints.
export function getStripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY not configured.");
  client ??= new Stripe(process.env.STRIPE_SECRET_KEY);
  return client;
}
```

- [ ] **Step 5: Run tests**

Run: `npm test && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Document env vars**

In `README.md`'s "Environment variables" table, add:

```
| `STRIPE_SECRET_KEY` | For paid sessions | Platform Stripe secret key — `sk_test_…` on preview, `sk_live_…` on production. Clubs connect their own accounts to it (Stripe Connect, Standard). |
| `STRIPE_WEBHOOK_SECRET` | For paid sessions | Signing secret of the Connect webhook endpoint `/api/stripe/webhook` (listening to *events on connected accounts*). |
```

Add both to `.env.local` locally (test values) and to Vercel **Preview** with test values. Production gets live values only when Plan 2 ships.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json lib/stripe/server.ts lib/payments README.md
git commit -m "Add Stripe client and per-child session pricing"
```

---

### Task 2: Schema for paid sessions

**Files:**
- Create: `supabase/migrations/0028_pending_payment_status.sql`
- Create: `supabase/migrations/0029_paid_sessions.sql`
- Create: `supabase/migrations/0029_paid_sessions.verify.sql`
- Modify: `supabase/migrations/README.md`
- Modify: `lib/supabase/types.ts`

**Interfaces:**
- Produces (TypeScript):
  - `SignupStatus = "confirmed" | "waitlisted" | "cancelled" | "pending_payment"`
  - `ClubRow` + `stripe_account_id: string | null; stripe_charges_enabled: boolean`
  - `EventRow` / `EventSeriesRow` + `paid: boolean`
  - `BookingRow` + `amount_pence: number | null; hold_expires_at: string | null; stripe_checkout_session_id: string | null; stripe_checkout_url: string | null; stripe_payment_intent_id: string | null; paid_at: string | null`
  - `BookingPersonRow` + `price_pence: number | null`
  - `StripeCustomerRow { attendee_id; stripe_account_id; stripe_customer_id; created_at }`
  - `create_booking` Args + `p_hold_minutes?: number | null`, and `p_people` elements + `price_pence?: number | null`
  - `confirm_paid_booking: { Args: { p_booking_id: string; p_checkout_session_id: string; p_payment_intent_id: string }; Returns: "confirmed" | "already_confirmed" | "not_pending" | "not_found" }`
  - `expire_payment_hold: { Args: { p_booking_id: string }; Returns: boolean }`
- Produces (SQL): `event_active_people(uuid)`, the new `create_booking(uuid, uuid, jsonb, integer default null)`, `confirm_paid_booking`, `expire_payment_hold`, updated `event_spaces_left` and `cancel_booking`, and the `events_prevent_paid_delete` trigger.

- [ ] **Step 1: Enum migration**

```sql
-- supabase/migrations/0028_pending_payment_status.sql
-- Enum value only, in its own file: ALTER TYPE ... ADD VALUE can't be
-- referenced in the same transaction it's added in (same reason 0006,
-- 0011 and 0023 are standalone). 0029 uses it.
alter type signup_status add value if not exists 'pending_payment';
```

- [ ] **Step 2: Paid-sessions migration**

```sql
-- supabase/migrations/0029_paid_sessions.sql
-- Members centre, part 2: paid club sessions via Stripe Connect (spec:
-- docs/superpowers/specs/2026-10-03-members-centre-paid-sessions-design.md).
-- Each club connects its own Standard Stripe account; charges are direct
-- charges on that account. A paid booking is held as pending_payment while
-- the parent is in Checkout, and the hold counts against capacity only
-- until hold_expires_at — so an abandoned Checkout frees its place on its
-- own, with no webhook or cron needed for correctness.

-- ---------- clubs ----------
alter table clubs add column stripe_account_id text unique;
alter table clubs add column stripe_charges_enabled boolean not null default false;

-- ---------- events / event_series ----------
alter table events add column paid boolean not null default false;
alter table events add constraint paid_requires_signup_and_club
  check (not paid or (bookable and club_id is not null));
alter table event_series add column paid boolean not null default false;
alter table event_series add constraint series_paid_requires_signup_and_club
  check (not paid or (bookable and club_id is not null));

-- ---------- bookings / booking_people ----------
alter table bookings add column amount_pence integer check (amount_pence is null or amount_pence >= 0);
alter table bookings add column hold_expires_at timestamptz;
alter table bookings add column stripe_checkout_session_id text unique;
alter table bookings add column stripe_checkout_url text;
alter table bookings add column stripe_payment_intent_id text;
alter table bookings add column paid_at timestamptz;

alter table booking_people add column price_pence integer check (price_pence is null or price_pence >= 0);

-- ---------- stripe_customers ----------
-- Direct charges need the Customer to live on the club's connected
-- account, so a parent has one Customer per club they've paid. Written
-- only by the service-role client; parents can read their own (the
-- saved-cards page needs to know which accounts to list).
create table stripe_customers (
  attendee_id uuid not null references attendees (id) on delete cascade,
  stripe_account_id text not null,
  stripe_customer_id text not null,
  created_at timestamptz not null default now(),
  primary key (attendee_id, stripe_account_id)
);

alter table stripe_customers enable row level security;
create policy "parents can read their own stripe customers"
  on stripe_customers for select using (auth.uid() = attendee_id);

-- ---------- stripe_webhook_events ----------
-- Idempotency ledger: a Stripe event id is recorded after it's handled,
-- and a redelivery of a recorded id is acknowledged without re-running.
-- RLS on, no policies: service role only.
create table stripe_webhook_events (
  id text primary key,
  type text not null,
  received_at timestamptz not null default now()
);
alter table stripe_webhook_events enable row level security;

-- ---------- event_active_people(): the one capacity count ----------
create function event_active_people(p_event_id uuid) returns integer as $$
  select count(*)::integer
  from bookings b
  join booking_people bp on bp.booking_id = b.id
  where b.event_id = p_event_id
    and (b.status = 'confirmed' or (b.status = 'pending_payment' and b.hold_expires_at > now()));
$$ language sql stable security definer set search_path = public;

revoke execute on function event_active_people(uuid) from public, anon, authenticated;

-- ---------- event_spaces_left(): now counts live holds ----------
create or replace function event_spaces_left(p_event_id uuid)
returns integer as $$
declare
  v_capacity integer;
begin
  select booking_capacity into v_capacity from events where id = p_event_id and approved = true;
  if v_capacity is null then
    return null;
  end if;
  return greatest(v_capacity - event_active_people(p_event_id), 0);
end;
$$ language plpgsql stable security definer set search_path = public;

-- ---------- create_booking(): optional payment hold ----------
-- Dropped and recreated (not replaced) because the signature gains a
-- parameter; keeping the 3-arg version alongside would make PostgREST's
-- named-argument resolution ambiguous. p_hold_minutes null = free event,
-- behaves exactly as before.
drop function create_booking(uuid, uuid, jsonb);

create function create_booking(
  p_event_id uuid,
  p_attendee_id uuid,
  p_people jsonb,
  p_hold_minutes integer default null
) returns table (booking_id uuid, status text) as $$
declare
  v_capacity integer;
  v_people_count integer;
  v_status signup_status;
  v_booking_id uuid;
  v_amount integer;
begin
  perform pg_advisory_xact_lock(hashtext(p_event_id::text));

  v_people_count := jsonb_array_length(p_people);
  if v_people_count = 0 then
    raise exception 'At least one person is required.';
  end if;

  select booking_capacity into v_capacity from events where id = p_event_id;

  if v_capacity is null or event_active_people(p_event_id) + v_people_count <= v_capacity then
    v_status := case when p_hold_minutes is null then 'confirmed'::signup_status else 'pending_payment'::signup_status end;
  else
    v_status := 'waitlisted';
  end if;

  if p_hold_minutes is not null then
    select coalesce(sum((p->>'price_pence')::integer), 0) into v_amount from jsonb_array_elements(p_people) as p;
  end if;

  insert into bookings (event_id, attendee_id, status, amount_pence, hold_expires_at)
  values (
    p_event_id, p_attendee_id, v_status, v_amount,
    case when v_status = 'pending_payment' then now() + make_interval(mins => p_hold_minutes) end
  )
  returning id into v_booking_id;

  insert into booking_people (booking_id, name, age_category, rider_id, group_id, price_pence)
  select v_booking_id, p->>'name', (p->>'age_category')::age_category,
         nullif(p->>'rider_id', '')::uuid, nullif(p->>'group_id', '')::uuid,
         nullif(p->>'price_pence', '')::integer
  from jsonb_array_elements(p_people) as p;

  return query select v_booking_id, v_status::text;
end;
$$ language plpgsql set search_path = public;

revoke execute on function create_booking(uuid, uuid, jsonb, integer) from public, anon, authenticated;
grant execute on function create_booking(uuid, uuid, jsonb, integer) to service_role;

-- ---------- confirm_paid_booking(): called by the webhook ----------
-- Returns what happened so the caller can decide (lib/payments/
-- checkout-outcome.ts): 'not_pending' means money arrived for a place we
-- no longer hold, and the caller must refund it.
create function confirm_paid_booking(
  p_booking_id uuid,
  p_checkout_session_id text,
  p_payment_intent_id text
) returns text as $$
declare
  v_status signup_status;
  v_event_id uuid;
  v_attendee_id uuid;
  v_hold timestamptz;
  v_capacity integer;
  v_people integer;
begin
  select event_id into v_event_id from bookings where id = p_booking_id;
  if v_event_id is null then
    return 'not_found';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_event_id::text));

  select status, attendee_id, hold_expires_at into v_status, v_attendee_id, v_hold
    from bookings where id = p_booking_id for update;

  if v_status = 'confirmed' then
    return 'already_confirmed';
  end if;
  if v_status <> 'pending_payment' then
    return 'not_pending';
  end if;

  -- Hold lapsed (shouldn't happen: Checkout expires first) — only honour
  -- it if the place genuinely still fits; otherwise release and refund.
  if v_hold is not null and v_hold <= now() then
    select booking_capacity into v_capacity from events where id = v_event_id;
    select count(*) into v_people from booking_people where booking_id = p_booking_id;
    if v_capacity is not null and event_active_people(v_event_id) + v_people > v_capacity then
      update bookings set status = 'cancelled', hold_expires_at = null where id = p_booking_id;
      return 'not_pending';
    end if;
  end if;

  update bookings
    set status = 'confirmed',
        paid_at = now(),
        hold_expires_at = null,
        stripe_checkout_session_id = coalesce(stripe_checkout_session_id, p_checkout_session_id),
        stripe_payment_intent_id = p_payment_intent_id
    where id = p_booking_id;

  -- Spec: a waitlisted family that completes a paid booking leaves the
  -- waitlist for that session.
  update bookings set status = 'cancelled'
    where event_id = v_event_id and attendee_id = v_attendee_id and status = 'waitlisted';

  return 'confirmed';
end;
$$ language plpgsql security definer set search_path = public;

revoke execute on function confirm_paid_booking(uuid, text, text) from public, anon, authenticated;
grant execute on function confirm_paid_booking(uuid, text, text) to service_role;

-- ---------- expire_payment_hold(): Checkout expired or abandoned ----------
create function expire_payment_hold(p_booking_id uuid) returns boolean as $$
  with updated as (
    update bookings set status = 'cancelled', hold_expires_at = null
    where id = p_booking_id and status = 'pending_payment'
    returning id
  )
  select exists (select 1 from updated);
$$ language sql security definer set search_path = public;

revoke execute on function expire_payment_hold(uuid) from public, anon, authenticated;
grant execute on function expire_payment_hold(uuid) to service_role;

-- ---------- cancel_booking(): paid-aware ----------
-- Changes from 0018: (1) a *paid* confirmed booking can't be self-cancelled
-- yet — refunds arrive in the next migration set (members-centre Plan 3);
-- (2) freed space is computed with event_active_people so live holds
-- count; (3) paid sessions never auto-promote (their waitlist is a notify
-- list — promoting someone into an unpaid place would hold it hostage).
create or replace function cancel_booking(p_booking_id uuid)
returns table (
  cancelled_event_id uuid,
  promoted_booking_id uuid,
  promoted_attendee_id uuid
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
  if v_prev_status = 'cancelled' then
    return query select v_event_id, null::uuid, null::uuid;
    return;
  end if;
  if v_prev_status = 'confirmed' and v_paid_at is not null then
    raise exception 'Paid bookings can''t be cancelled online yet. Please contact your coach.';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_event_id::text));

  update bookings set status = 'cancelled', hold_expires_at = null where id = p_booking_id;

  select booking_capacity, paid into v_capacity, v_event_paid from events where id = v_event_id;

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

  return query select v_event_id, v_promoted_booking_id, v_promoted_attendee_id;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- never let a delete erase a money trail ----------
-- bookings.event_id cascades, so deleting a session would silently delete
-- paid bookings and with them the only link to their Stripe payments.
create function prevent_deleting_paid_events() returns trigger as $$
begin
  if exists (select 1 from bookings where event_id = old.id and paid_at is not null) then
    raise exception 'This session has paid bookings. Cancel the session (which refunds families) instead of deleting it.';
  end if;
  return old;
end;
$$ language plpgsql set search_path = public;

create trigger events_prevent_paid_delete before delete on events
  for each row execute function prevent_deleting_paid_events();
```

- [ ] **Step 3: Verification script**

```sql
-- supabase/migrations/0029_paid_sessions.verify.sql
-- Throwaway check, NOT a migration. Run after 0028 + 0029.
do $$
declare
  v_parent_a uuid := gen_random_uuid();
  v_parent_b uuid := gen_random_uuid();
  v_club uuid;
  v_event uuid;
  v_a uuid;
  v_b uuid;
  v_status text;
  v_result text;
  v_caught boolean := false;
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (v_parent_a, 'scratch-0029a@example.com', '{"role":"attendee"}'::jsonb),
    (v_parent_b, 'scratch-0029b@example.com', '{"role":"attendee"}'::jsonb);
  insert into clubs (name, location) values ('SCRATCH CLUB 0029', 'Nowhere') returning id into v_club;
  insert into events (title, discipline, kind, club_id, start_datetime, venue_name, organiser_url, region, approved, bookable, booking_capacity, paid)
  values ('SCRATCH 0029', 'road', 'training', v_club, now() + interval '7 days', 'Test', 'https://example.com', 'devon', true, true, 1, true)
  returning id into v_event;

  -- A takes the only place as a hold; B is waitlisted behind the live hold.
  select booking_id, status into v_a, v_status from create_booking(v_event, v_parent_a, '[{"name":"A","age_category":"u10","price_pence":350}]'::jsonb, 36);
  assert v_status = 'pending_payment', 'paid booking should start as pending_payment';
  assert (select amount_pence from bookings where id = v_a) = 350, 'amount should be summed from people';
  assert event_spaces_left(v_event) = 0, 'live hold should count against capacity';
  select booking_id, status into v_b, v_status from create_booking(v_event, v_parent_b, '[{"name":"B","age_category":"u10","price_pence":350}]'::jsonb, 36);
  assert v_status = 'waitlisted', 'second family should be waitlisted behind a live hold';

  -- Expired hold stops counting without any cleanup job.
  update bookings set hold_expires_at = now() - interval '1 minute' where id = v_a;
  assert event_spaces_left(v_event) = 1, 'expired hold should not count';

  -- Payment for the lapsed hold still confirms when the place is free.
  select confirm_paid_booking(v_a, 'cs_test_x', 'pi_test_x') into v_result;
  assert v_result = 'confirmed', 'lapsed-but-still-fits hold should confirm';
  select confirm_paid_booking(v_a, 'cs_test_x', 'pi_test_x') into v_result;
  assert v_result = 'already_confirmed', 'replayed webhook should be a no-op';

  -- Payment for a cancelled booking must be reported for refund.
  update bookings set status = 'cancelled' where id = v_b;
  select confirm_paid_booking(v_b, 'cs_test_y', 'pi_test_y') into v_result;
  assert v_result = 'not_pending', 'payment for a cancelled booking must be refunded by the caller';

  -- Paid events can't be deleted.
  begin
    delete from events where id = v_event;
  exception when raise_exception then v_caught := true;
  end;
  assert v_caught, 'deleting an event with paid bookings should fail';

  -- Cleanup: bookings first (the trigger checks for them), then the rest.
  delete from bookings where event_id = v_event;
  delete from events where id = v_event;
  delete from clubs where id = v_club;
  delete from auth.users where id in (v_parent_a, v_parent_b);
  raise notice '0029 verification passed';
end $$;
```

- [ ] **Step 4: Types**

In `lib/supabase/types.ts`:
- `export type SignupStatus = "confirmed" | "waitlisted" | "cancelled" | "pending_payment";`
- Add the columns listed under **Interfaces** to `ClubRow`, `EventRow`, `EventSeriesRow`, `BookingRow`, `BookingPersonRow`. In `EventPendingRow`, add nothing (pending rows are never paid).
- Add:

```ts
export interface StripeCustomerRow {
  attendee_id: string;
  stripe_account_id: string;
  stripe_customer_id: string;
  created_at: string;
}
```

- Tables: `stripe_customers: { Row: AsRecord<StripeCustomerRow>; Insert: AsRecord<Partial<StripeCustomerRow>>; Update: AsRecord<Partial<StripeCustomerRow>>; Relationships: [] };` and `stripe_webhook_events: { Row: { id: string; type: string; received_at: string }; Insert: { id: string; type: string }; Update: Record<string, never>; Relationships: [] };`
- Functions: replace `create_booking`'s Args with

```ts
        Args: {
          p_event_id: string;
          p_attendee_id: string;
          p_people: { name: string; age_category: AgeCategory; rider_id?: string | null; group_id?: string | null; price_pence?: number | null }[];
          p_hold_minutes?: number | null;
        };
```

  and add

```ts
      confirm_paid_booking: {
        Args: { p_booking_id: string; p_checkout_session_id: string; p_payment_intent_id: string };
        Returns: "confirmed" | "already_confirmed" | "not_pending" | "not_found";
      };
      expire_payment_hold: {
        Args: { p_booking_id: string };
        Returns: boolean;
      };
```

- [ ] **Step 5: README rows**

Append to `supabase/migrations/README.md`'s table:

```
| `0028_pending_payment_status.sql` | Adds `'pending_payment'` to `signup_status` — enum value only, in its own transaction (see `0006`). |
| `0029_paid_sessions.sql` | Paid club sessions via Stripe Connect: `clubs.stripe_account_id`/`stripe_charges_enabled`, `events.paid`/`event_series.paid` (require signups + a club), payment columns on `bookings` and `booking_people.price_pence`, `stripe_customers` (one Customer per parent per club account), `stripe_webhook_events` (idempotency). `event_active_people()` is now the one capacity count (confirmed + unexpired `pending_payment` holds), used by `event_spaces_left()`, the recreated 4-arg `create_booking()` (optional `p_hold_minutes`) and `cancel_booking()` — which also refuses to self-cancel paid confirmed bookings and never auto-promotes on paid sessions. Adds `confirm_paid_booking()` / `expire_payment_hold()` for the webhook, and a trigger refusing to delete an event that has paid bookings. |
```

- [ ] **Step 6: Type-check, apply, verify**

Run: `npx tsc --noEmit`
Expected: no errors.

Ask the user to run `0028`, then `0029`, then `0029_paid_sessions.verify.sql` in the Supabase SQL editor.
Expected: `NOTICE: 0029 verification passed`.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0028_pending_payment_status.sql supabase/migrations/0029_paid_sessions.sql supabase/migrations/0029_paid_sessions.verify.sql supabase/migrations/README.md lib/supabase/types.ts
git commit -m "Add paid-session schema with payment holds and webhook confirmation"
```

---

### Task 3: Club Stripe onboarding

**Files:**
- Create: `lib/stripe/accounts.ts`
- Create: `lib/actions/club-payments.ts`
- Create: `app/organiser/clubs/[id]/payments/page.tsx`
- Create: `app/organiser/clubs/[id]/payments/return/route.ts`
- Create: `components/clubs/ConnectStripeButton.tsx`
- Modify: `app/organiser/page.tsx` (a "Payments" link beside "Groups" in "Your clubs")
- Modify: `lib/data.ts` (`getClubRowById`)

**Interfaces:**
- Consumes: `canManageClub`, `getStripe`.
- Produces:
  - `getClubRowById(id: string): Promise<ClubRow | null>` (raw row incl. Stripe columns; `getClubById` returns the display `Club` type)
  - `syncClubStripeAccount(clubId: string, stripeAccountId: string): Promise<{ chargesEnabled: boolean; detailsSubmitted: boolean }>` (service-role write)
  - `startStripeOnboarding(clubId: string): Promise<{ error?: string }>` (redirects to Stripe on success)

- [ ] **Step 1: Account helpers**

```ts
// lib/stripe/accounts.ts
import "server-only";
import { getStripe } from "./server";
import { createAdminClient } from "@/lib/supabase/admin";

// Reads the connected account's live status from Stripe and mirrors it
// into clubs. Called from the onboarding return route and from the
// account.updated webhook, so the two can never disagree for long.
export async function syncClubStripeAccount(
  clubId: string,
  stripeAccountId: string
): Promise<{ chargesEnabled: boolean; detailsSubmitted: boolean }> {
  const account = await getStripe().accounts.retrieve(stripeAccountId);
  const admin = createAdminClient();
  await admin.from("clubs").update({ stripe_charges_enabled: account.charges_enabled }).eq("id", clubId).eq("stripe_account_id", stripeAccountId);
  return { chargesEnabled: account.charges_enabled, detailsSubmitted: account.details_submitted };
}
```

Append to `lib/data.ts`:

```ts
export async function getClubRowById(id: string): Promise<ClubRow | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("clubs").select("*").eq("id", id).maybeSingle();
  return data as ClubRow | null;
}
```

- [ ] **Step 2: Onboarding action**

```ts
// lib/actions/club-payments.ts
"use server";

import { redirect } from "next/navigation";
import * as Sentry from "@sentry/nextjs";
import { getStripe } from "@/lib/stripe/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { canManageClub, getCurrentProfile } from "@/lib/auth";
import { getClubRowById } from "@/lib/data";

// Creates the club's Standard connected account on first use, then sends
// the coach to Stripe's hosted onboarding. Standard (not Express/Custom):
// the club owns a full Stripe account and dashboard, handles its own
// disputes and payouts, and the platform never holds its money.
export async function startStripeOnboarding(clubId: string): Promise<{ error?: string }> {
  const profile = await getCurrentProfile();
  if (!(await canManageClub(profile, clubId))) return { error: "Not authorised for this club." };

  const club = await getClubRowById(clubId);
  if (!club) return { error: "Club not found." };

  const stripe = getStripe();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  let url: string;

  try {
    let accountId = club.stripe_account_id;
    if (!accountId) {
      const account = await stripe.accounts.create(
        { type: "standard", country: "GB", business_profile: { name: club.name, url: club.website ?? undefined } },
        { idempotencyKey: `connect-account-${clubId}` }
      );
      accountId = account.id;
      const admin = createAdminClient();
      const { error } = await admin.from("clubs").update({ stripe_account_id: accountId }).eq("id", clubId).is("stripe_account_id", null);
      if (error) return { error: error.message };
    }

    const link = await stripe.accountLinks.create({
      account: accountId,
      type: "account_onboarding",
      refresh_url: `${siteUrl}/organiser/clubs/${clubId}/payments`,
      return_url: `${siteUrl}/organiser/clubs/${clubId}/payments/return`,
    });
    url = link.url;
  } catch (e) {
    Sentry.captureException(e, { tags: { operation: "stripe_onboarding" } });
    return { error: "Couldn't reach Stripe. Try again in a minute." };
  }

  redirect(url);
}
```

(`redirect` is called outside the `try` because it works by throwing.)

- [ ] **Step 3: Return route, page, and button**

```ts
// app/organiser/clubs/[id]/payments/return/route.ts
import { NextRequest, NextResponse } from "next/server";
import { canManageClub, getCurrentProfile } from "@/lib/auth";
import { getClubRowById } from "@/lib/data";
import { syncClubStripeAccount } from "@/lib/stripe/accounts";

// Stripe sends the coach back here after onboarding. Returning doesn't mean
// onboarding is complete, so re-read the account rather than trusting it.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const back = new URL(`/organiser/clubs/${id}/payments`, request.url);
  if (!(await canManageClub(await getCurrentProfile(), id))) return NextResponse.redirect(back);

  const club = await getClubRowById(id);
  if (club?.stripe_account_id) await syncClubStripeAccount(id, club.stripe_account_id);
  return NextResponse.redirect(back);
}
```

```tsx
// components/clubs/ConnectStripeButton.tsx
"use client";

import { useState, useTransition } from "react";
import { startStripeOnboarding } from "@/lib/actions/club-payments";

export default function ConnectStripeButton({ clubId, label }: { clubId: string; label: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await startStripeOnboarding(clubId);
            if (r?.error) setError(r.error);
          })
        }
        style={{ background: "#111111", color: "#FAFAF8", border: "none", padding: "12px 24px", fontWeight: 700, fontSize: 13.5, cursor: "pointer", opacity: pending ? 0.6 : 1 }}
      >
        {pending ? "Opening Stripe…" : label}
      </button>
      {error && <p style={{ color: "#A13A2A", fontSize: 12.5, marginTop: 10 }}>{error}</p>}
    </div>
  );
}
```

```tsx
// app/organiser/clubs/[id]/payments/page.tsx
import { notFound } from "next/navigation";
import { canManageClub, getCurrentProfile } from "@/lib/auth";
import { getClubGroups, getClubRowById } from "@/lib/data";
import ConnectStripeButton from "@/components/clubs/ConnectStripeButton";

export default async function ClubPaymentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await canManageClub(await getCurrentProfile(), id))) notFound();
  const club = await getClubRowById(id);
  if (!club) notFound();
  const groups = await getClubGroups(id);

  const p: React.CSSProperties = { maxWidth: 600, fontSize: 14, lineHeight: 1.65, color: "#4A4A46", marginBottom: 14 };

  return (
    <header style={{ maxWidth: 1100, margin: "0 auto", padding: "56px 24px 120px" }}>
      <div className="mono" style={{ fontSize: 11.5, letterSpacing: "0.12em", color: "#E0102A", marginBottom: 16, fontWeight: 700 }}>{club.name.toUpperCase()}</div>
      <h1 className="disp" style={{ fontSize: "clamp(28px, 4.5vw, 40px)", lineHeight: 1.05, margin: 0, marginBottom: 24 }}>Payments.</h1>

      {club.stripe_charges_enabled ? (
        <>
          <p style={p}><strong>Connected.</strong> Session payments go straight to {club.name}&apos;s own Stripe account. Payouts, receipts and disputes are managed in your <a href="https://dashboard.stripe.com" target="_blank" rel="noreferrer">Stripe dashboard</a>.</p>
          <p style={p}>Tip: turn on Stripe&apos;s receipt emails (Stripe dashboard → Settings → Customer emails → Successful payments) so parents get a receipt from Stripe as well as our booking confirmation.</p>
        </>
      ) : club.stripe_account_id ? (
        <>
          <p style={p}>Stripe still needs a few details before {club.name} can take payments.</p>
          <ConnectStripeButton clubId={id} label="Finish Stripe setup" />
        </>
      ) : (
        <>
          <p style={p}>Connect {club.name}&apos;s Stripe account so parents can pay for sessions when they book. You&apos;ll create (or sign in to) the club&apos;s own Stripe account. This site never holds the club&apos;s money and takes no fee. Stripe charges its standard UK card fees.</p>
          <ConnectStripeButton clubId={id} label="Connect Stripe" />
        </>
      )}

      {groups.length === 0 && (
        <p style={{ ...p, color: "#A13A2A", marginTop: 24 }}>
          Add at least one group with a price on the <a href={`/organiser/clubs/${id}/groups`}>Groups page</a> before switching sessions to paid.
        </p>
      )}
    </header>
  );
}
```

In `app/organiser/page.tsx`'s "Your clubs" panel, add `<a href={`/organiser/clubs/${c.id}/payments`} …>Payments</a>` next to the Groups link.

- [ ] **Step 4: Verify (manual, Stripe test mode on preview)**

1. Stripe dashboard (test mode) → Connect → enable Connect for the platform if not already. Set the platform profile (it's a marketplace/platform for clubs).
2. As the Mid Devon coach, `/organiser/clubs/<mid-devon>/payments` → **Connect Stripe** → complete onboarding with Stripe's test data (use "Skip this form" / test values when offered).
3. Back on the page: "Connected." In Supabase, `clubs.stripe_account_id` is `acct_…` and `stripe_charges_enabled = true`.
4. Click **Connect Stripe** twice quickly on a fresh test club. Only one `acct_` is created (idempotency key).

Run: `npx tsc --noEmit && npm run lint`. Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add lib/stripe/accounts.ts lib/actions/club-payments.ts app/organiser components/clubs/ConnectStripeButton.tsx lib/data.ts
git commit -m "Let a club connect its own Stripe account"
```

---

### Task 4: Free/Paid inside the signup section

**Files:**
- Modify: `lib/actions/parse-signup-fields.ts` + `.test.ts`
- Modify: `components/events/SignupSettings.tsx`
- Create: `lib/actions/club-payment-summary.ts`
- Modify: `components/events/EventForm.tsx`, `components/events/SeriesForm.tsx` (pass `clubId` and `paid`)
- Modify: `lib/actions/parse-event-form.ts`, `lib/actions/parse-series-form.ts` (types include `paid`), `lib/series-rows.ts` (copy `paid`)
- Modify: `lib/actions/events.ts` (`saveEvent`), `lib/actions/event-series.ts` (`saveSeries`)

**Interfaces:**
- Consumes: `formatPence`, `getClubGroups`, `getClubRowById`.
- Produces:
  - `parseSignupFields` values become `{ bookable: boolean; booking_capacity: number | null; paid: boolean }`; form field `price_mode` = `"free" | "paid"`.
  - `getClubPaymentSummary(clubId: string): Promise<{ ready: boolean; reason: string | null; groupsSummary: string }>` (Server Action, callable from the client; returns only public info)
  - `<SignupSettings bookable capacity paid clubId />`

- [ ] **Step 1: Extend the parser test first**

Update the expected values in `lib/actions/parse-signup-fields.test.ts` to include `paid: false` everywhere, and add:

```ts
  it("reads the price choice", () => {
    expect(parseSignupFields(fd({ bookable: "on", price_mode: "paid" }))).toEqual({
      ok: true,
      values: { bookable: true, booking_capacity: null, paid: true },
    });
  });
  it("is never paid when signups are off", () => {
    expect(parseSignupFields(fd({ price_mode: "paid" }))).toEqual({
      ok: true,
      values: { bookable: false, booking_capacity: null, paid: false },
    });
  });
```

Run: `npm test -- parse-signup-fields`. Expected: FAIL (`paid` missing).

- [ ] **Step 2: Implement the parser change**

In `parse-signup-fields.ts`, change the return type's values to `{ bookable: boolean; booking_capacity: number | null; paid: boolean }`, return `paid: false` in the not-bookable branch, and compute `const paid = String(formData.get("price_mode") ?? "free") === "paid";` for both bookable branches (`{ bookable: true, booking_capacity: …, paid }`).

Run: `npm test`. Expected: PASS.

Add `"paid"` to the `Pick<>` list of the event form values type in `parse-event-form.ts` and to `EventSeriesFormValues` in `parse-series-form.ts`. In both prefill functions add `paid: event.paid` / `paid: false`. In `lib/series-rows.ts`, add `paid: values.paid,` to all four builders.

- [ ] **Step 3: Server-side readiness check**

```ts
// lib/actions/club-payment-summary.ts
"use server";

import { getClubGroups, getClubRowById } from "@/lib/data";
import { formatPence } from "@/lib/money";

// Public information only (group names/prices are already public via
// club_groups RLS), so no auth check — the event form calls this whenever
// the selected club changes, and saveEvent/saveSeries call it as the
// authoritative check.
export async function getClubPaymentSummary(clubId: string): Promise<{ ready: boolean; reason: string | null; groupsSummary: string }> {
  const club = await getClubRowById(clubId);
  if (!club) return { ready: false, reason: "Pick a club first.", groupsSummary: "" };
  const groups = await getClubGroups(clubId);
  const groupsSummary = groups.map((g) => `${g.name} ${formatPence(g.price_pence)}`).join(" · ");
  if (!club.stripe_charges_enabled) return { ready: false, reason: `${club.name} hasn't connected Stripe yet.`, groupsSummary };
  if (groups.length === 0) return { ready: false, reason: `${club.name} has no groups with prices yet.`, groupsSummary };
  return { ready: true, reason: null, groupsSummary };
}
```

In `saveEvent` (`lib/actions/events.ts`) and `saveSeries` (`lib/actions/event-series.ts`), directly after the `if (!parsed.ok) return { error: parsed.error };` line, add:

```ts
  if (parsed.values.paid) {
    const summary = await getClubPaymentSummary(parsed.values.club_id!);
    if (!summary.ready) return { error: `Can't make this a paid session: ${summary.reason}` };
  }
```

In `saveEvent`'s **update** path only, also refuse to flip `paid` while the event has active bookings. Load the current row's `paid`, and if it differs and `activeBookingCountForEvents([id]) > 0`, return `{ error: "This session already has bookings, so it can't switch between free and paid." }`. Import `activeBookingCountForEvents` from `@/lib/series-booking-guard`.

- [ ] **Step 4: UI**

Replace `components/events/SignupSettings.tsx`'s body so the price choice sits inside the same panel:

```tsx
"use client";

import { useEffect, useState } from "react";
import { getClubPaymentSummary } from "@/lib/actions/club-payment-summary";

const label: React.CSSProperties = { fontSize: 10.5, color: "#6B6B66", display: "block", marginBottom: 6, letterSpacing: "0.03em" };
const input: React.CSSProperties = { width: "100%", background: "#FFFFFF", border: "1px solid #D8D6D0", color: "#111111", padding: "9px 11px", fontSize: 13.5 };

// The single place an organiser turns on native signups, for one-off
// events and recurring series alike. Free/Paid lives inside it (spec:
// "one signup section, not a separate paid toggle").
export default function SignupSettings({
  bookable: initialBookable,
  capacity,
  paid: initialPaid,
  clubId,
}: {
  bookable: boolean;
  capacity: number | null;
  paid: boolean;
  clubId: string;
}) {
  const [bookable, setBookable] = useState(initialBookable);
  const [paid, setPaid] = useState(initialPaid);
  const [summary, setSummary] = useState<{ ready: boolean; reason: string | null; groupsSummary: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!clubId) {
      setSummary({ ready: false, reason: "Pick the club that runs this session.", groupsSummary: "" });
      return;
    }
    getClubPaymentSummary(clubId).then((s) => {
      if (!cancelled) setSummary(s);
    });
    return () => {
      cancelled = true;
    };
  }, [clubId]);

  const paidAllowed = summary?.ready ?? false;

  return (
    <div style={{ background: "#F3F2EE", border: "1px solid #E4E2DD", padding: "16px 18px", marginBottom: 20 }}>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: bookable ? 14 : 0 }}>
        <input type="checkbox" name="bookable" checked={bookable} onChange={(e) => setBookable(e.target.checked)} />
        Take signups on this site
      </label>
      {bookable && (
        <>
          <div style={{ marginBottom: 14 }}>
            <label className="mono" style={label}>SPACE LIMIT (OPTIONAL — BLANK = UNLIMITED)</label>
            <input style={{ ...input, maxWidth: 140 }} type="number" min={1} step={1} name="booking_capacity" defaultValue={capacity ?? ""} />
          </div>
          <div>
            <span className="mono" style={label}>PRICE</span>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 6 }}>
              <input type="radio" name="price_mode" value="free" checked={!paid} onChange={() => setPaid(false)} />
              Free
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, opacity: paidAllowed || paid ? 1 : 0.5 }}>
              <input type="radio" name="price_mode" value="paid" checked={paid} disabled={!paidAllowed && !paid} onChange={() => setPaid(true)} />
              Paid: each child pays their club group&apos;s price
            </label>
            {summary?.groupsSummary && <p className="mono" style={{ fontSize: 11, color: "#6B6B66", margin: "6px 0 0 24px" }}>{summary.groupsSummary}</p>}
            {summary && !summary.ready && (
              <p style={{ fontSize: 12, color: "#6B6B66", margin: "6px 0 0 24px" }}>
                {summary.reason}{" "}
                {clubId && <a href={`/organiser/clubs/${clubId}/payments`}>Set up payments</a>}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
```

In `EventForm.tsx`: `<SignupSettings bookable={event?.bookable ?? false} capacity={event?.booking_capacity ?? null} paid={event?.paid ?? false} clubId={clubId} />` (the form already holds `clubId` in state at line ~55). In `SeriesForm.tsx`: same, with `base?.paid ?? false` and its `clubId` state.

- [ ] **Step 5: Verify**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: clean.

Manual (preview): on a new event, tick "Take signups". With no club, Paid is disabled with "Pick the club…". Pick Mid Devon (connected, with groups): the groups line shows "Group 1 £3.50 · Group 2 £3.50 · Group 3 £6.00" and Paid is enabled. Pick a club with no Stripe: Paid is disabled with a "Set up payments" link. Save a paid test session, then try to save it as paid under an unconnected club via devtools (remove `disabled`). Expected: server error "Can't make this a paid session: …".

- [ ] **Step 6: Commit**

```bash
git add lib/actions/parse-signup-fields.ts lib/actions/parse-signup-fields.test.ts components/events/SignupSettings.tsx lib/actions/club-payment-summary.ts components/events/EventForm.tsx components/events/SeriesForm.tsx lib/actions/parse-event-form.ts lib/actions/parse-series-form.ts lib/series-rows.ts lib/actions/events.ts lib/actions/event-series.ts
git commit -m "Add a Free/Paid choice inside the signup section"
```

---

### Task 5: Paid booking through Stripe Checkout

**Files:**
- Create: `lib/stripe/customers.ts`
- Create: `lib/actions/paid-bookings.ts`
- Modify: `components/events/RiderSignupForm.tsx` (prices, total, redirect to Checkout)
- Modify: `app/events/[id]/page.tsx` (paid sessions: signed-in only)
- Create: `app/my-events/(protected)/bookings/[id]/payment/page.tsx`
- Create: `components/members/PaymentReturn.tsx`
- Modify: `lib/data.ts` (`MyBooking` + `getMyBookings` payment fields; `getMyBookingById`)
- Modify: `components/events/MyBookingsList.tsx`

**Interfaces:**
- Consumes: `priceRiders`, `resolveRiderGroups`, `riderAgeCategory`, `CHECKOUT_EXPIRY_MINUTES`, `PAYMENT_HOLD_MINUTES`, `getStripe`, `create_booking` with `p_hold_minutes`.
- Produces:
  - `getOrCreateStripeCustomer(attendee: AttendeeRow, stripeAccountId: string): Promise<string>`
  - `createPaidBooking(eventId: string, _prev: PaidBookingState, formData: FormData): Promise<PaidBookingState>` with `PaidBookingState = { error?: string; checkoutUrl?: string; waitlisted?: boolean; confirmedFree?: boolean }`
  - `abandonPendingBooking(bookingId: string): Promise<{ error?: string }>` (parent cancels their own hold and expires the Checkout Session)
  - `MyBooking` gains `amount_pence: number | null; paid_at: string | null; hold_expires_at: string | null; stripe_checkout_url: string | null; event.paid: boolean`
  - `getMyBookingById(id: string): Promise<MyBooking | null>`
  - Checkout `success_url`: `/my-events/bookings/{id}/payment?result=success`; `cancel_url`: `…?result=cancelled`
  - Checkout metadata: `{ booking_id }` on the Session **and** on `payment_intent_data.metadata`

- [ ] **Step 1: Customer helper**

```ts
// lib/stripe/customers.ts
import "server-only";
import { getStripe } from "./server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AttendeeRow } from "@/lib/supabase/types";

// One Customer per parent per club account (direct charges require the
// Customer on the connected account). Saved cards attach to it, which is
// what makes them reappear at the top of Checkout next time.
export async function getOrCreateStripeCustomer(attendee: AttendeeRow, stripeAccountId: string): Promise<string> {
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("stripe_customers")
    .select("stripe_customer_id")
    .eq("attendee_id", attendee.id)
    .eq("stripe_account_id", stripeAccountId)
    .maybeSingle();
  if (existing) return existing.stripe_customer_id;

  const customer = await getStripe().customers.create(
    { email: attendee.email, name: attendee.contact_name ?? undefined, metadata: { attendee_id: attendee.id } },
    { stripeAccount: stripeAccountId, idempotencyKey: `customer-${attendee.id}-${stripeAccountId}` }
  );
  await admin.from("stripe_customers").upsert({
    attendee_id: attendee.id,
    stripe_account_id: stripeAccountId,
    stripe_customer_id: customer.id,
  });
  return customer.id;
}
```

- [ ] **Step 2: The paid booking action**

```ts
// lib/actions/paid-bookings.ts
"use server";

import * as Sentry from "@sentry/nextjs";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAttendee } from "@/lib/auth";
import { getClubGroups, getClubRowById, getRiderGroupAssignments } from "@/lib/data";
import { parseRiderBookingForm } from "./parse-rider-booking-form";
import { resolveRiderGroups } from "@/lib/riders/resolve-groups";
import { riderAgeCategory } from "@/lib/riders/age-category";
import { priceRiders } from "@/lib/payments/pricing";
import { CHECKOUT_EXPIRY_MINUTES, PAYMENT_HOLD_MINUTES } from "@/lib/payments/constants";
import { getStripe } from "@/lib/stripe/server";
import { getOrCreateStripeCustomer } from "@/lib/stripe/customers";
import type { EventRow, RiderRow } from "@/lib/supabase/types";

export interface PaidBookingState {
  error?: string;
  checkoutUrl?: string;
  waitlisted?: boolean;
  confirmedFree?: boolean;
}

export async function createPaidBooking(eventId: string, _prev: PaidBookingState, formData: FormData): Promise<PaidBookingState> {
  const attendee = await getCurrentAttendee();
  if (!attendee) return { error: "Please sign in again." };

  const parsed = parseRiderBookingForm(formData);
  if (!parsed.ok) return { error: parsed.error };

  const admin = createAdminClient();
  const { data: eventData } = await admin.from("events").select("*").eq("id", eventId).single();
  const event = eventData as EventRow | null;
  if (!event || !event.bookable || !event.paid || !event.approved || !event.club_id) return { error: "This session isn't taking paid bookings." };

  const club = await getClubRowById(event.club_id);
  if (!club?.stripe_account_id || !club.stripe_charges_enabled) return { error: "This club can't take payments right now." };

  const supabase = await createClient();
  const { data: riderData } = await supabase.from("riders").select("*").in("id", parsed.riderIds).eq("attendee_id", attendee.id).is("archived_at", null);
  const riders = (riderData ?? []) as RiderRow[];
  if (riders.length !== parsed.riderIds.length) return { error: "One of those children isn't on your account." };

  const { data: already } = await admin
    .from("booking_people")
    .select("rider_id, booking:bookings!inner(event_id, status, hold_expires_at)")
    .in("rider_id", parsed.riderIds)
    .eq("booking.event_id", eventId)
    .in("booking.status", ["confirmed", "pending_payment"]);
  const live = (already ?? []).filter((r) => {
    const b = (r as unknown as { booking: { status: string; hold_expires_at: string | null } }).booking;
    return b.status === "confirmed" || (b.hold_expires_at !== null && b.hold_expires_at > new Date().toISOString());
  });
  if (live.length > 0) return { error: "One of those children is already booked (or mid-payment) on this session. Check Bookings in the members centre." };

  const groups = await getClubGroups(event.club_id);
  const resolved = resolveRiderGroups({
    riders,
    assignments: await getRiderGroupAssignments(parsed.riderIds, event.club_id),
    choices: parsed.groupChoices,
    activeGroupIds: groups.map((g) => g.id),
  });
  if (!resolved.ok) return { error: resolved.error };
  const priced = priceRiders(riders, resolved.groupByRider, groups);
  if (!priced.ok) return { error: priced.error };

  if (resolved.toSave.length > 0) {
    await admin.from("rider_club_groups").upsert(
      resolved.toSave.map((s) => ({ rider_id: s.riderId, club_id: event.club_id!, group_id: s.groupId, assigned_by: null, assigned_at: new Date().toISOString() }))
    );
  }

  const sessionDate = event.start_datetime.slice(0, 10);
  const people = priced.lines.map((l) => {
    const rider = riders.find((r) => r.id === l.riderId)!;
    return { name: l.riderName, age_category: riderAgeCategory(rider, sessionDate), rider_id: l.riderId, group_id: l.groupId, price_pence: l.pricePence };
  });

  // A £0 total can't go through Stripe (minimum charge is 30p) and needs no
  // payment, so it books like a free session.
  const free = priced.totalPence === 0;
  const { data: result, error: rpcError } = await admin.rpc("create_booking", {
    p_event_id: eventId,
    p_attendee_id: attendee.id,
    p_people: people,
    p_hold_minutes: free ? null : PAYMENT_HOLD_MINUTES,
  });
  if (rpcError || !result || result.length === 0) return { error: rpcError?.message ?? "Couldn't hold your place." };
  const { booking_id: bookingId, status } = result[0];
  if (status === "waitlisted") return { waitlisted: true };
  if (free) return { confirmedFree: true };

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  try {
    const stripe = getStripe();
    const customer = await getOrCreateStripeCustomer(attendee, club.stripe_account_id);
    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        customer,
        client_reference_id: bookingId,
        metadata: { booking_id: bookingId },
        payment_intent_data: {
          metadata: { booking_id: bookingId },
          description: `${event.title} (${sessionDate})`,
        },
        line_items: priced.lines.map((l) => ({
          quantity: 1,
          price_data: {
            currency: "gbp",
            unit_amount: l.pricePence,
            product_data: { name: `${event.title}: ${l.riderName} (${l.groupName})` },
          },
        })),
        saved_payment_method_options: { payment_method_save: "enabled" },
        expires_at: Math.floor(Date.now() / 1000) + CHECKOUT_EXPIRY_MINUTES * 60,
        success_url: `${siteUrl}/my-events/bookings/${bookingId}/payment?result=success`,
        cancel_url: `${siteUrl}/my-events/bookings/${bookingId}/payment?result=cancelled`,
      },
      { stripeAccount: club.stripe_account_id, idempotencyKey: `checkout-${bookingId}` }
    );

    await admin.from("bookings").update({ stripe_checkout_session_id: session.id, stripe_checkout_url: session.url }).eq("id", bookingId);
    return { checkoutUrl: session.url! };
  } catch (e) {
    Sentry.captureException(e, { tags: { operation: "create_checkout_session" } });
    await admin.rpc("expire_payment_hold", { p_booking_id: bookingId });
    return { error: "Couldn't start payment. Your place hasn't been taken. Please try again." };
  }
}

// "Back" from Checkout, or "Cancel" on a pending booking: release the hold
// now rather than waiting out its timer, and expire the Checkout Session
// so it can't be completed afterwards.
export async function abandonPendingBooking(bookingId: string): Promise<{ error?: string }> {
  const attendee = await getCurrentAttendee();
  if (!attendee) return { error: "Please sign in again." };

  const admin = createAdminClient();
  const { data: booking } = await admin
    .from("bookings")
    .select("attendee_id, status, stripe_checkout_session_id, event:events!inner(club:clubs(stripe_account_id))")
    .eq("id", bookingId)
    .single();
  const b = booking as unknown as {
    attendee_id: string;
    status: string;
    stripe_checkout_session_id: string | null;
    event: { club: { stripe_account_id: string | null } | null };
  } | null;
  if (!b || b.attendee_id !== attendee.id) return { error: "Booking not found." };
  if (b.status !== "pending_payment") return {};

  const accountId = b.event.club?.stripe_account_id;
  if (b.stripe_checkout_session_id && accountId) {
    try {
      await getStripe().checkout.sessions.expire(b.stripe_checkout_session_id, {}, { stripeAccount: accountId });
    } catch {
      // Already expired or completed. The webhook decides what happens if
      // it was completed (confirm, or refund if we've already released it).
    }
  }
  await admin.rpc("expire_payment_hold", { p_booking_id: bookingId });
  return {};
}
```

- [ ] **Step 3: Form and event page**

In `components/events/RiderSignupForm.tsx`:
- add a prop `paid: boolean`;
- when `paid`, bind `createPaidBooking` instead of `createRiderBooking` (`const action = paid ? createPaidBooking : createRiderBooking;` then `useActionState<PaidBookingState & CreateBookingState, FormData>(action.bind(null, eventId), {})`);
- after the hook, redirect when a Checkout URL arrives:

```tsx
  useEffect(() => {
    if (state.checkoutUrl) window.location.assign(state.checkoutUrl);
  }, [state.checkoutUrl]);
```

- show prices: track each rider's selected group in state (`const [groupChoice, setGroupChoice] = useState<Record<string, string>>(…initial from assignments…)`, updated in the select's `onChange`). For each ticked rider, price = the group's `price_pence` (locked assignment or current choice). Render a total line above the button when `paid`:

```tsx
      {paid && ticked.size > 0 && (
        <p className="mono" style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 12 }}>
          TOTAL {formatPence(total)}{unpriced ? " (pick a group for every child)" : ""}
        </p>
      )}
```

  where `total` sums the priced ticked riders and `unpriced` is true if any ticked rider has no group yet;
- button label when `paid`: `pending ? "Starting payment…" : full ? "Join waitlist" : \`Pay ${formatPence(total)}\``; disabled while `unpriced`;
- success copy: `state.waitlisted` → "You're on the waitlist. We'll email you if a place opens."; `state.confirmedFree` → "You're in."; `state.checkoutUrl` → "Taking you to secure payment…".

In `app/events/[id]/page.tsx`: pass `paid={event.paid}` to `RiderSignupForm`. For a **paid** event with no signed-in parent, render this instead of the guest `SignupForm`:

```tsx
            <div style={{ background: "#F3F2EE", border: "1px solid #E4E2DD", padding: "20px 22px", maxWidth: 420 }}>
              <p style={{ fontSize: 14, marginBottom: 12 }}>
                Paid session. Sign in (or just enter your email if you&apos;re new) to book and pay. We&apos;ll remember your children&apos;s details and, if you choose, your card.
              </p>
              <a href="/my-events/login" style={{ display: "inline-block", background: "#111111", color: "#FAFAF8", padding: "10px 20px", fontWeight: 700, fontSize: 13 }}>
                Sign in to book
              </a>
            </div>
```

- [ ] **Step 4: Payment return page**

Add to `lib/data.ts`, and extend `MyBooking`/`getMyBookings` with the payment fields from **Interfaces**. The select becomes `"id, status, amount_pence, paid_at, hold_expires_at, stripe_checkout_url, event:events!inner(id, title, start_datetime, venue_name, paid), people:booking_people(name, age_category)"`.

```ts
export async function getMyBookingById(id: string): Promise<MyBooking | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("bookings")
    .select("id, status, amount_pence, paid_at, hold_expires_at, stripe_checkout_url, event:events!inner(id, title, start_datetime, venue_name, paid), people:booking_people(name, age_category)")
    .eq("id", id)
    .maybeSingle();
  return data as unknown as MyBooking | null;
}
```

```tsx
// components/members/PaymentReturn.tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { abandonPendingBooking } from "@/lib/actions/paid-bookings";

// Success: the webhook usually lands within a second or two of the
// redirect, so poll the server component a few times before falling back
// to "we'll email you". Cancelled: release the hold straight away.
export default function PaymentReturn({ bookingId, result, status }: { bookingId: string; result: string; status: string }) {
  const router = useRouter();

  useEffect(() => {
    if (result === "cancelled" && status === "pending_payment") {
      abandonPendingBooking(bookingId).then(() => router.refresh());
      return;
    }
    if (result === "success" && status === "pending_payment") {
      let tries = 0;
      const t = setInterval(() => {
        tries++;
        router.refresh();
        if (tries >= 10) clearInterval(t);
      }, 2000);
      return () => clearInterval(t);
    }
  }, [bookingId, result, status, router]);

  return null;
}
```

```tsx
// app/my-events/(protected)/bookings/[id]/payment/page.tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { getMyBookingById } from "@/lib/data";
import { formatPence } from "@/lib/money";
import PaymentReturn from "@/components/members/PaymentReturn";

export default async function PaymentReturnPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ result?: string }>;
}) {
  const { id } = await params;
  const { result = "success" } = await searchParams;
  const booking = await getMyBookingById(id);
  if (!booking) notFound();

  const heading =
    booking.status === "confirmed"
      ? "You're booked in."
      : booking.status === "pending_payment"
        ? result === "cancelled"
          ? "Payment cancelled."
          : "Confirming your payment…"
        : "This booking isn't active.";

  const body =
    booking.status === "confirmed"
      ? `Paid ${formatPence(booking.amount_pence ?? 0)}. A confirmation email is on its way.`
      : booking.status === "pending_payment" && result !== "cancelled"
        ? "This usually takes a few seconds. If it doesn't update, we'll email you as soon as Stripe confirms."
        : "Your place has been released and you haven't been charged.";

  return (
    <header style={{ maxWidth: 720, margin: "0 auto", padding: "56px 24px 120px" }}>
      <div className="mono" style={{ fontSize: 11.5, letterSpacing: "0.12em", color: "#E0102A", marginBottom: 16, fontWeight: 700 }}>{booking.event.title.toUpperCase()}</div>
      <h1 className="disp" style={{ fontSize: "clamp(28px, 4.5vw, 40px)", lineHeight: 1.05, margin: 0, marginBottom: 16 }}>{heading}</h1>
      <p style={{ fontSize: 14.5, lineHeight: 1.6, color: "#4A4A46", marginBottom: 24 }}>{body}</p>
      <Link href="/my-events" className="mono" style={{ fontSize: 12, fontWeight: 700 }}>← Your bookings</Link>
      <PaymentReturn bookingId={id} result={result} status={booking.status} />
    </header>
  );
}
```

- [ ] **Step 5: Bookings list understands payment**

In `components/events/MyBookingsList.tsx`, for each booking:
- status label: `pending_payment` → `AWAITING PAYMENT`; confirmed with `paid_at` → `PAID ${formatPence(amount_pence)}`;
- `pending_payment` with `hold_expires_at > now` and a `stripe_checkout_url`: show a **Complete payment** link (`<a href={b.stripe_checkout_url}>`) and a **Cancel** button that calls `abandonPendingBooking(b.id)` then `router.refresh()`;
- `pending_payment` with an expired hold: hide it. Also filter these out in `getMyBookings` with `.or("status.neq.pending_payment,hold_expires_at.gt.<nowIso>")`;
- confirmed **and** `paid_at` set: replace the Cancel button with `<span style={{ fontSize: 12, color: "#6B6B66" }}>Contact your coach to cancel</span>` (Plan 3 replaces this).

- [ ] **Step 6: Verify (manual, needs Task 6's webhook for confirmation)**

Run: `npx tsc --noEmit && npm run lint`. Expected: clean.

Defer the end-to-end payment check to Task 6 Step 5. For now, on preview: as a signed-in test parent on the paid test session, tick a child and press **Pay £3.50**. Expected: redirect to Stripe Checkout showing "<title>: <child> (Group 1)" for £3.50. Press Back. Expected: "Payment cancelled… you haven't been charged", the booking is `cancelled` in Supabase, and `spaces left` is back to full.

- [ ] **Step 7: Commit**

```bash
git add lib/stripe/customers.ts lib/actions/paid-bookings.ts components/events/RiderSignupForm.tsx app/events app/my-events components/members/PaymentReturn.tsx lib/data.ts components/events/MyBookingsList.tsx
git commit -m "Take payment for paid sessions through Stripe Checkout with saved cards"
```

---

### Task 6: Stripe webhook

**Files:**
- Create: `lib/payments/checkout-outcome.ts`
- Create: `lib/payments/checkout-outcome.test.ts`
- Create: `lib/stripe/webhook-handlers.ts`
- Create: `app/api/stripe/webhook/route.ts`
- Create: `lib/email/paid-booking-confirmation.ts`
- Create: `lib/email/payment-problem.ts`

**Interfaces:**
- Consumes: `confirm_paid_booking`, `expire_payment_hold`, `syncClubStripeAccount`, `sendEmail`.
- Produces:
  - `checkoutOutcome(input: { paymentStatus: string; confirmResult: "confirmed" | "already_confirmed" | "not_pending" | "not_found" }): "send_confirmation" | "refund" | "nothing"`
  - `handleStripeEvent(event: Stripe.Event): Promise<void>` (throws on transient failure so Stripe retries)
  - `buildPaidBookingConfirmationHtml(args: { event: EventRow; lines: { name: string; groupName: string | null; pricePence: number }[]; totalPence: number; manageUrl: string }): string`
  - `buildPaymentProblemHtml(args: { eventTitle: string; kind: "expired" | "refunded_late"; eventUrl: string }): string`

- [ ] **Step 1: Failing test for the decision table**

```ts
// lib/payments/checkout-outcome.test.ts
import { describe, expect, it } from "vitest";
import { checkoutOutcome } from "./checkout-outcome";

describe("checkoutOutcome", () => {
  it("confirms and emails on a fresh paid confirmation", () => {
    expect(checkoutOutcome({ paymentStatus: "paid", confirmResult: "confirmed" })).toBe("send_confirmation");
  });
  it("does nothing on a replayed event", () => {
    expect(checkoutOutcome({ paymentStatus: "paid", confirmResult: "already_confirmed" })).toBe("nothing");
  });
  it("refunds money that arrived for a released place", () => {
    expect(checkoutOutcome({ paymentStatus: "paid", confirmResult: "not_pending" })).toBe("refund");
  });
  it("refunds money for a booking that no longer exists", () => {
    expect(checkoutOutcome({ paymentStatus: "paid", confirmResult: "not_found" })).toBe("refund");
  });
  it("does nothing if Checkout completed without the money (async methods)", () => {
    expect(checkoutOutcome({ paymentStatus: "unpaid", confirmResult: "confirmed" })).toBe("nothing");
  });
});
```

Run: `npm test -- checkout-outcome`. Expected: FAIL (module missing).

- [ ] **Step 2: Implement**

```ts
// lib/payments/checkout-outcome.ts
// What to do after checkout.session.completed has been applied to the DB
// via confirm_paid_booking(). Only card-like methods are enabled, so
// payment_status is 'paid' in practice; anything else is left alone
// rather than confirmed. (The webhook handler only calls
// confirm_paid_booking when payment_status is 'paid'.)
export function checkoutOutcome(input: {
  paymentStatus: string;
  confirmResult: "confirmed" | "already_confirmed" | "not_pending" | "not_found";
}): "send_confirmation" | "refund" | "nothing" {
  if (input.paymentStatus !== "paid") return "nothing";
  switch (input.confirmResult) {
    case "confirmed":
      return "send_confirmation";
    case "already_confirmed":
      return "nothing";
    case "not_pending":
    case "not_found":
      return "refund";
  }
}
```

Run: `npm test`. Expected: PASS.

- [ ] **Step 3: Emails**

```ts
// lib/email/paid-booking-confirmation.ts
import "server-only";
import type { EventRow } from "@/lib/supabase/types";
import { fmtDay } from "@/lib/format";
import { formatPence } from "@/lib/money";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

// Same branded table layout as booking-confirmation.ts, plus what was paid.
// Stripe sends the formal receipt if the club has turned that on.
export function buildPaidBookingConfirmationHtml(args: {
  event: EventRow;
  lines: { name: string; groupName: string | null; pricePence: number }[];
  totalPence: number;
  manageUrl: string;
}): string {
  const { event, lines, totalPence, manageUrl } = args;
  const f = fmtDay(event.start_datetime.slice(0, 10));
  const rows = lines
    .map((l) => `${escapeHtml(l.name)}${l.groupName ? ` · ${escapeHtml(l.groupName)}` : ""} · ${formatPence(l.pricePence)}`)
    .join("<br/>");

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAFAF8;padding:40px 0;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">
      <tr><td style="font-family:Georgia,'Times New Roman',serif;font-weight:bold;font-size:15px;letter-spacing:0.02em;color:#111111;padding-bottom:32px;">SOUTH WEST KIDS CYCLING</td></tr>
      <tr><td style="font-family:-apple-system,Helvetica,Arial,sans-serif;font-size:11px;font-weight:bold;letter-spacing:0.1em;color:#E0102A;padding-bottom:14px;">BOOKED &amp; PAID</td></tr>
      <tr><td style="font-family:Georgia,'Times New Roman',serif;font-weight:bold;font-size:26px;line-height:1.2;color:#111111;padding-bottom:12px;">You're in.</td></tr>
      <tr><td style="font-family:-apple-system,Helvetica,Arial,sans-serif;font-size:13px;line-height:1.7;color:#111111;border-top:1px solid #E4E2DD;padding-top:16px;padding-bottom:16px;">
        <strong>${escapeHtml(event.title)}</strong><br/>
        ${f.day} ${f.mon} &middot; ${escapeHtml(event.venue_name)}<br/><br/>
        ${rows}<br/>
        <strong>Total paid: ${formatPence(totalPence)}</strong>
      </td></tr>
      <tr><td style="padding-top:8px;">
        <a href="${escapeHtml(manageUrl)}" style="display:inline-block;background:#111111;color:#FAFAF8;font-family:-apple-system,Helvetica,Arial,sans-serif;font-weight:bold;font-size:14px;text-decoration:none;padding:13px 26px;">View your bookings</a>
      </td></tr>
    </table>
  </td></tr>
</table>
`;
}
```

```ts
// lib/email/payment-problem.ts
import "server-only";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function buildPaymentProblemHtml(args: { eventTitle: string; kind: "expired" | "refunded_late"; eventUrl: string }): string {
  const headline = args.kind === "expired" ? "Payment not completed." : "We've refunded your payment.";
  const body =
    args.kind === "expired"
      ? "Your payment wasn't finished in time, so we've released the place. You haven't been charged. You can book again if there's still space."
      : "Your payment arrived after the place had been released, so we couldn't confirm it. We've refunded you in full. It can take 5–10 days to appear.";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAFAF8;padding:40px 0;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">
      <tr><td style="font-family:Georgia,'Times New Roman',serif;font-weight:bold;font-size:15px;color:#111111;padding-bottom:32px;">SOUTH WEST KIDS CYCLING</td></tr>
      <tr><td style="font-family:Georgia,'Times New Roman',serif;font-weight:bold;font-size:24px;line-height:1.2;color:#111111;padding-bottom:12px;">${headline}</td></tr>
      <tr><td style="font-family:-apple-system,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:#4A4A46;padding-bottom:20px;"><strong>${escapeHtml(args.eventTitle)}</strong><br/>${body}</td></tr>
      <tr><td><a href="${escapeHtml(args.eventUrl)}" style="display:inline-block;background:#111111;color:#FAFAF8;font-family:-apple-system,Helvetica,Arial,sans-serif;font-weight:bold;font-size:14px;text-decoration:none;padding:13px 26px;">View session</a></td></tr>
    </table>
  </td></tr>
</table>
`;
}
```

- [ ] **Step 4: Handlers and route**

```ts
// lib/stripe/webhook-handlers.ts
import "server-only";
import type Stripe from "stripe";
import * as Sentry from "@sentry/nextjs";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "./server";
import { syncClubStripeAccount } from "./accounts";
import { checkoutOutcome } from "@/lib/payments/checkout-outcome";
import { sendEmail } from "@/lib/email/resend";
import { buildPaidBookingConfirmationHtml } from "@/lib/email/paid-booking-confirmation";
import { buildPaymentProblemHtml } from "@/lib/email/payment-problem";
import type { EventRow } from "@/lib/supabase/types";

const siteUrl = () => process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.southwestkidscycling.uk";

async function bookingContext(bookingId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("bookings")
    .select("id, amount_pence, attendee:attendees(email), event:events(*), people:booking_people(name, price_pence, group:club_groups(name))")
    .eq("id", bookingId)
    .maybeSingle();
  return data as unknown as {
    id: string;
    amount_pence: number | null;
    attendee: { email: string };
    event: EventRow;
    people: { name: string; price_pence: number | null; group: { name: string } | null }[];
  } | null;
}

async function onCheckoutCompleted(session: Stripe.Checkout.Session, accountId: string) {
  const bookingId = session.metadata?.booking_id ?? session.client_reference_id;
  if (!bookingId || session.payment_status !== "paid") return;

  const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? "";
  const admin = createAdminClient();
  const { data: confirmResult, error } = await admin.rpc("confirm_paid_booking", {
    p_booking_id: bookingId,
    p_checkout_session_id: session.id,
    p_payment_intent_id: paymentIntentId,
  });
  if (error) throw error; // Stripe retries.

  const outcome = checkoutOutcome({ paymentStatus: session.payment_status, confirmResult: confirmResult! });
  const ctx = await bookingContext(bookingId);

  if (outcome === "refund") {
    await getStripe().refunds.create(
      { payment_intent: paymentIntentId, metadata: { booking_id: bookingId, reason: "late_payment" } },
      { stripeAccount: accountId, idempotencyKey: `refund-late-${bookingId}` }
    );
    Sentry.captureMessage("Refunded a payment for a released booking", { level: "warning", tags: { booking_id: bookingId } });
    if (ctx) {
      try {
        await sendEmail({
          to: ctx.attendee.email,
          subject: `Refunded: ${ctx.event.title}`,
          html: buildPaymentProblemHtml({ eventTitle: ctx.event.title, kind: "refunded_late", eventUrl: `${siteUrl()}/events/${ctx.event.id}` }),
        });
      } catch {}
    }
    return;
  }

  if (outcome === "send_confirmation" && ctx) {
    try {
      await sendEmail({
        to: ctx.attendee.email,
        subject: `Booked & paid: ${ctx.event.title}`,
        html: buildPaidBookingConfirmationHtml({
          event: ctx.event,
          lines: ctx.people.map((p) => ({ name: p.name, groupName: p.group?.name ?? null, pricePence: p.price_pence ?? 0 })),
          totalPence: ctx.amount_pence ?? 0,
          manageUrl: `${siteUrl()}/my-events`,
        }),
      });
    } catch {}
  }
}

async function onCheckoutExpired(session: Stripe.Checkout.Session) {
  const bookingId = session.metadata?.booking_id ?? session.client_reference_id;
  if (!bookingId) return;
  const admin = createAdminClient();
  const { data: released, error } = await admin.rpc("expire_payment_hold", { p_booking_id: bookingId });
  if (error) throw error;
  // Only email if this event actually released something. A parent who
  // pressed Back already had the hold released by abandonPendingBooking.
  if (released) {
    const ctx = await bookingContext(bookingId);
    if (ctx) {
      try {
        await sendEmail({
          to: ctx.attendee.email,
          subject: `Payment not completed: ${ctx.event.title}`,
          html: buildPaymentProblemHtml({ eventTitle: ctx.event.title, kind: "expired", eventUrl: `${siteUrl()}/events/${ctx.event.id}` }),
        });
      } catch {}
    }
  }
}

async function onAccountUpdated(account: Stripe.Account) {
  const admin = createAdminClient();
  const { data: club } = await admin.from("clubs").select("id").eq("stripe_account_id", account.id).maybeSingle();
  if (club) await syncClubStripeAccount(club.id, account.id);
}

export async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  const accountId = event.account;
  switch (event.type) {
    case "checkout.session.completed":
      if (accountId) await onCheckoutCompleted(event.data.object, accountId);
      return;
    case "checkout.session.expired":
      await onCheckoutExpired(event.data.object);
      return;
    case "account.updated":
      await onAccountUpdated(event.data.object);
      return;
    default:
      return;
  }
}
```

```ts
// app/api/stripe/webhook/route.ts
import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { getStripe } from "@/lib/stripe/server";
import { handleStripeEvent } from "@/lib/stripe/webhook-handlers";
import { createAdminClient } from "@/lib/supabase/admin";

// Connect webhook ("events on connected accounts"). The raw body must be
// read with request.text(): signature verification is over the exact bytes
// Stripe sent, so parsing JSON first would break it.
export async function POST(request: NextRequest) {
  const signature = request.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !secret) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  const body = await request.text();
  let event;
  try {
    event = getStripe().webhooks.constructEvent(body, signature, secret);
  } catch {
    return NextResponse.json({ error: "Bad signature" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: seen } = await admin.from("stripe_webhook_events").select("id").eq("id", event.id).maybeSingle();
  if (seen) return NextResponse.json({ received: true, duplicate: true });

  try {
    await handleStripeEvent(event);
  } catch (e) {
    Sentry.captureException(e, { tags: { operation: "stripe_webhook", stripe_event: event.type } });
    return NextResponse.json({ error: "Handler failed" }, { status: 500 }); // Stripe retries with backoff.
  }

  // Recorded only after success, so a failed attempt is retried rather
  // than skipped. Handlers are idempotent anyway (confirm_paid_booking
  // reports already_confirmed; refunds use idempotency keys).
  await admin.from("stripe_webhook_events").insert({ id: event.id, type: event.type });
  return NextResponse.json({ received: true });
}
```

`proxy.ts` runs `updateSession` on every path including this one. That's harmless: it only refreshes auth cookies, doesn't read the body, and `/api/stripe` isn't in `PROTECTED_PREFIXES`. Confirm with `grep -n PROTECTED_PREFIXES lib/supabase/middleware.ts` (it should still be `["/admin", "/organiser"]`).

- [ ] **Step 5: Verify end to end (manual, Stripe test mode)**

1. Stripe dashboard (test) → Developers → Webhooks → **Add endpoint** → `https://sw-calendar-alpha.vercel.app/api/stripe/webhook`, **"Events on connected accounts"**, events: `checkout.session.completed`, `checkout.session.expired`, `account.updated`. Copy the signing secret into Vercel Preview `STRIPE_WEBHOOK_SECRET` and redeploy preview.
2. As a test parent, book two children on the paid test session (Group 1 + Group 3). Expected total £9.50. In Checkout, tick "save my card", pay with `4242 4242 4242 4242`.
3. Expected: the return page flips to "You're booked in. Paid £9.50." within a few seconds. A "Booked & paid" email arrives. The booking is `confirmed` with `paid_at`. Two `stripe_webhook_events` rows appear.
4. Book again with another child. Expected: Checkout shows the saved Visa •••• 4242 at the top.
5. In the Stripe dashboard, **Resend** the `checkout.session.completed` event. Expected: 200 `duplicate: true`, no second email.
6. Start a booking and leave Checkout open. In the Stripe dashboard → the Checkout Session → **Expire**. Expected: booking `cancelled`, "Payment not completed" email, place freed.
7. Bad signature: `curl -X POST https://sw-calendar-alpha.vercel.app/api/stripe/webhook -H 'stripe-signature: t=1,v1=bad' -d '{}'`. Expected: 400.

Run: `npm test && npx tsc --noEmit && npm run lint`. Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add lib/payments/checkout-outcome.ts lib/payments/checkout-outcome.test.ts lib/stripe/webhook-handlers.ts app/api/stripe/webhook/route.ts lib/email/paid-booking-confirmation.ts lib/email/payment-problem.ts
git commit -m "Confirm paid bookings from Stripe's webhook and refund late payments"
```

---

### Task 7: Saved cards in the members centre

**Files:**
- Create: `lib/stripe/payment-methods.ts`
- Create: `lib/actions/saved-cards.ts`
- Create: `app/my-events/(protected)/payment-methods/page.tsx`
- Create: `components/members/SavedCardsList.tsx`
- Modify: `components/members/MembersNav.tsx` (add the `cards` tab)

**Interfaces:**
- Produces:
  - `SavedCard = { id: string; stripeAccountId: string; clubName: string; brand: string; last4: string; expMonth: number; expYear: number }`
  - `listSavedCards(attendeeId: string): Promise<SavedCard[]>`
  - `removeSavedCard(stripeAccountId: string, paymentMethodId: string): Promise<{ error?: string }>`

- [ ] **Step 1: Implement**

```ts
// lib/stripe/payment-methods.ts
import "server-only";
import { getStripe } from "./server";
import { createAdminClient } from "@/lib/supabase/admin";

export interface SavedCard {
  id: string;
  stripeAccountId: string;
  clubName: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
}

// Cards are saved per club (one Customer per club account), so the page
// lists them grouped by club. Only Stripe's non-sensitive display fields
// are read: brand, last 4, expiry.
export async function listSavedCards(attendeeId: string): Promise<SavedCard[]> {
  const admin = createAdminClient();
  const { data: customers } = await admin.from("stripe_customers").select("stripe_account_id, stripe_customer_id").eq("attendee_id", attendeeId);
  if (!customers || customers.length === 0) return [];

  const { data: clubs } = await admin.from("clubs").select("name, stripe_account_id").in("stripe_account_id", customers.map((c) => c.stripe_account_id));
  const stripe = getStripe();
  const cards: SavedCard[] = [];

  for (const c of customers) {
    const list = await stripe.customers.listPaymentMethods(c.stripe_customer_id, { type: "card", limit: 20 }, { stripeAccount: c.stripe_account_id });
    for (const pm of list.data) {
      if (!pm.card) continue;
      cards.push({
        id: pm.id,
        stripeAccountId: c.stripe_account_id,
        clubName: clubs?.find((cl) => cl.stripe_account_id === c.stripe_account_id)?.name ?? "Club",
        brand: pm.card.brand,
        last4: pm.card.last4,
        expMonth: pm.card.exp_month,
        expYear: pm.card.exp_year,
      });
    }
  }
  return cards;
}
```

```ts
// lib/actions/saved-cards.ts
"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAttendee } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/server";

// Verifies the card belongs to *this* parent's Customer on that account
// before detaching — paymentMethodId comes from the client and can't be
// trusted on its own.
export async function removeSavedCard(stripeAccountId: string, paymentMethodId: string): Promise<{ error?: string }> {
  const attendee = await getCurrentAttendee();
  if (!attendee) return { error: "Please sign in again." };

  const admin = createAdminClient();
  const { data: customer } = await admin
    .from("stripe_customers")
    .select("stripe_customer_id")
    .eq("attendee_id", attendee.id)
    .eq("stripe_account_id", stripeAccountId)
    .maybeSingle();
  if (!customer) return { error: "Card not found." };

  const stripe = getStripe();
  const pm = await stripe.paymentMethods.retrieve(paymentMethodId, {}, { stripeAccount: stripeAccountId });
  const owner = typeof pm.customer === "string" ? pm.customer : pm.customer?.id;
  if (owner !== customer.stripe_customer_id) return { error: "Card not found." };

  await stripe.paymentMethods.detach(paymentMethodId, {}, { stripeAccount: stripeAccountId });
  revalidatePath("/my-events/payment-methods");
  return {};
}
```

```tsx
// components/members/SavedCardsList.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { removeSavedCard } from "@/lib/actions/saved-cards";
import type { SavedCard } from "@/lib/stripe/payment-methods";

export default function SavedCardsList({ cards }: { cards: SavedCard[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  if (cards.length === 0) {
    return <p style={{ color: "#6B6B66", fontSize: 13.5 }}>No saved cards. Tick &quot;save my card&quot; at checkout to pay faster next time.</p>;
  }

  return (
    <div style={{ borderTop: "2px solid #111111" }}>
      {cards.map((c) => (
        <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 6px", borderBottom: "1px solid #E4E2DD", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14.5 }}>{c.brand.toUpperCase()} •••• {c.last4}</div>
            <div className="mono" style={{ fontSize: 11, color: "#6B6B66", marginTop: 4 }}>
              EXPIRES {String(c.expMonth).padStart(2, "0")}/{c.expYear} · SAVED WITH {c.clubName.toUpperCase()}
            </div>
          </div>
          <button
            type="button"
            onClick={async () => {
              if (!confirm("Remove this card?")) return;
              const r = await removeSavedCard(c.stripeAccountId, c.id);
              if (r.error) setError(r.error);
              else router.refresh();
            }}
            className="mono"
            style={{ fontSize: 11.5, color: "#A13A2A", background: "none", border: "1px solid #D8D6D0", padding: "7px 14px", cursor: "pointer" }}
          >
            Remove
          </button>
        </div>
      ))}
      {error && <p style={{ color: "#A13A2A", fontSize: 12.5, marginTop: 10 }}>{error}</p>}
    </div>
  );
}
```

```tsx
// app/my-events/(protected)/payment-methods/page.tsx
import { getCurrentAttendee } from "@/lib/auth";
import { listSavedCards } from "@/lib/stripe/payment-methods";
import MembersNav from "@/components/members/MembersNav";
import SavedCardsList from "@/components/members/SavedCardsList";

export default async function PaymentMethodsPage() {
  const attendee = await getCurrentAttendee();
  const cards = attendee ? await listSavedCards(attendee.id) : [];

  return (
    <header style={{ maxWidth: 1100, margin: "0 auto", padding: "56px 24px 120px" }}>
      <div className="mono" style={{ fontSize: 11.5, letterSpacing: "0.12em", color: "#E0102A", marginBottom: 16, fontWeight: 700 }}>MEMBERS CENTRE</div>
      <h1 className="disp" style={{ fontSize: "clamp(32px, 5.2vw, 52px)", lineHeight: 1.02, margin: 0 }}>Saved cards.</h1>
      <MembersNav active="cards" />
      <p style={{ maxWidth: 520, fontSize: 13.5, color: "#4A4A46", margin: "24px 0" }}>
        Cards are stored securely by Stripe, never on this site. Each club keeps its own list, so a card saved with one club is offered only when paying that club.
      </p>
      <SavedCardsList cards={cards} />
    </header>
  );
}
```

In `MembersNav.tsx`, add `{ key: "cards", href: "/my-events/payment-methods", label: "Saved cards" }` to `TABS`.

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit && npm run lint`. Expected: clean.

Manual (preview): after Task 6's payment with "save my card", Saved cards shows "VISA •••• 4242 … SAVED WITH MID DEVON CC". Remove it, and the next Checkout no longer offers it. Call `removeSavedCard` for a card on a different test parent's Customer (temporarily from a scratch Server Component). Expected: "Card not found."

Add `/my-events/payment-methods` to the paths in `e2e/members-centre.spec.ts` and run `npx playwright test e2e/members-centre.spec.ts`. Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add lib/stripe/payment-methods.ts lib/actions/saved-cards.ts app/my-events components/members e2e/members-centre.spec.ts
git commit -m "Let parents see and remove their saved cards"
```

---

### Task 8: Roster money column, test cleanup, docs

**Files:**
- Modify: `lib/data.ts` (`EventBooking` + `amountPence`, `paidAt`)
- Modify: `components/events/AttendeesList.tsx` (show paid amount / awaiting payment)
- Modify: `lib/csv.ts` (Amount paid column)
- Modify: `lib/actions/rider-groups.ts` (don't rewrite a paid booking's group)
- Create: `scripts/delete-test-session.sql`
- Modify: `README.md`

- [ ] **Step 1: Roster shows payment**

Add `amount_pence, paid_at` to `getBookingsForEvent`'s select, map them to `amountPence: number | null; paidAt: string | null` on `EventBooking`, and in `AttendeesList` append to the contact line ` · PAID £x.xx` (when `paidAt`), or ` · AWAITING PAYMENT` for `pending_payment`. Add an "Amount paid (booking)" column to `bookingsToCsv` (`b.paidAt ? (b.amountPence! / 100).toFixed(2) : ""`).

In `assignRiderGroup` (`lib/actions/rider-groups.ts`), only update `booking_people.group_id` when that row's `price_pence` is null. A paid booking keeps the group it was charged for, and the club-wide assignment still changes for future bookings:

```ts
  const { error } = await admin.from("booking_people").update({ group_id: groupId }).eq("id", bookingPersonId).is("price_pence", null);
```

- [ ] **Step 2: Test-data cleanup script**

```sql
-- scripts/delete-test-session.sql
-- Preview shares the production database, so Stripe-test-mode bookings on
-- preview are real rows. Paste into the Supabase SQL editor, replace BOTH
-- '<test-event-uuid>' placeholders with the test session's id, and run.
-- Bookings go first, because the events_prevent_paid_delete trigger (0029)
-- refuses to delete a session that still has paid bookings.
-- Never run this against a real session: it erases the record of real payments.
delete from bookings where event_id = '<test-event-uuid>';
delete from events where id = '<test-event-uuid>';
```

- [ ] **Step 3: README**

- New section **"Paid sessions (Stripe)"** after "Members centre": Connect Standard + direct charges and why; club onboarding at `/organiser/clubs/[id]/payments`; Free/Paid inside the signup section; the hold/Checkout timing (31/36 min) and why correctness doesn't depend on webhooks; the webhook endpoint, its three events, and idempotency; late-payment auto-refund; saved cards; "paid confirmed bookings can't be self-cancelled until refunds ship" (remove this line in Plan 3); the delete trigger and `scripts/delete-test-session.sql`.
- "Project structure": `lib/stripe/` (server-only Stripe I/O) and `lib/payments/` (pure, unit-tested money rules); `app/api/stripe/webhook/`.
- "Preview environment": Stripe on preview uses **test keys** and a test-mode Connect webhook pointed at `sw-calendar-alpha.vercel.app`. Production gets its own live-mode webhook endpoint and secret.

- [ ] **Step 4: Full check and commit**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build`
Expected: all succeed.

```bash
git add lib/data.ts components/events/AttendeesList.tsx lib/csv.ts lib/actions/rider-groups.ts scripts/delete-test-session.sql README.md
git commit -m "Show payments on the roster and document paid sessions"
```

---

## After Plan 2

Before production: Mid Devon completes **live-mode** onboarding on production; create a **live** Connect webhook endpoint for `https://www.southwestkidscycling.uk/api/stripe/webhook` with the same three events; set `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` live values in Vercel Production; make one real £3.50 booking on a real session and refund it from Mid Devon's Stripe dashboard. Then [Plan 3](2026-10-03-members-centre-3-cancellations-refunds.md).
