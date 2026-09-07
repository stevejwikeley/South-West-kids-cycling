# Event Booking System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an organiser/admin mark an event as bookable with a capacity limit, let parents sign up multiple children through a public signup form, waitlist once full, and give attendees a magic-link account to see and cancel their bookings — plus organiser/admin tools to view attendees, message them, and a day-before reminder email.

**Architecture:** Three new Postgres tables (`attendees`, `bookings`, `booking_people`) alongside two new columns on `events` (`bookable`, `booking_capacity`). Capacity checks and waitlist promotion are done inside Postgres functions (`create_booking`, `cancel_booking`) rather than in application code, because supabase-js has no cross-table transaction support (see `lib/actions/event-series.ts`'s existing comment on this) and an app-level check-then-insert would race under concurrent signups. Attendees are a separate identity from the existing `profiles` (admin/organiser) table but reuse the same Supabase Auth magic-link mechanism as `/login` — the shared `handle_new_user()` trigger is extended to route `role: 'attendee'` signups into `attendees` instead of `profiles`, so a parent booking a place never becomes an organiser account. Everything else (event form, admin/organiser pages, Server Actions, Resend email templates) follows the existing per-feature-file conventions in `lib/actions/`, `lib/email/`, and `components/events/`.

**Tech Stack:** Next.js 16 App Router / Server Actions, Supabase (Postgres + Auth + RLS), Resend for email, Vercel Cron. No new dependencies.

**Spec:** [docs/superpowers/specs/2026-09-07-event-booking-design.md](../specs/2026-09-07-event-booking-design.md)

## Global Constraints

- Capacity is counted **per person**, not per booking — a family of 3 uses 3 spaces (spec: "Capacity counting").
- A booking's people are never split across confirmed/waitlisted — the whole booking goes on the waitlist together if it doesn't fully fit (spec: "Booking flow", step 2).
- Waitlist promotion walks oldest-first and **skips** (doesn't block on) a waitlisted booking that doesn't fit the freed space, so a large family waiting doesn't stall a smaller one behind them (spec: "Booking flow", step 5).
- `booking_capacity = null` means "bookable, no limit" — every capacity comparison must treat `null` as "always fits", never as zero (spec: "Error handling").
- An email send failing must never roll back or block the underlying booking/cancellation/promotion write — log and continue (spec: "Error handling").
- No payment collection anywhere in this feature — free events only (spec: "Out of scope for v1").
- Follow existing conventions exactly: manual `String(formData.get(...))` form parsing (no zod — see `lib/actions/parse-event-form.ts`), inline `style={{...}}` objects (no CSS framework), RLS as the real security boundary with `getCurrentProfile()`/route-level checks as defense in depth (see README "Roles & auth").
- This repo's e2e suite (`e2e/`) never writes real DB fixtures or exercises authenticated admin/organiser/attendee sessions (confirmed by reading every existing spec) — it covers only public, unauthenticated rendering/validation. Follow that same ceiling: tasks below use Playwright e2e only where the existing suite's pattern already supports it, and call out **manual verification** (browser + curl) elsewhere instead of inventing new test infrastructure (env-var-fed fixtures, a test auth flow, etc.) that has no precedent in this codebase.

---

## Task 1: Database schema, RLS, and booking functions

**Files:**
- Create: `supabase/migrations/0018_event_booking.sql`
- Modify: `supabase/migrations/README.md` (add the new migration's row to the "What's in each migration" table)
- Modify: `lib/supabase/types.ts`

**Interfaces:**
- Produces (used by every later task): `EventRow.bookable: boolean`, `EventRow.booking_capacity: number | null`; new `AttendeeRow`, `BookingRow`, `BookingPersonRow` types; `Database["public"]["Tables"]` entries for `attendees`, `bookings`, `booking_people`; `Database["public"]["Functions"]` entries for `create_booking`, `cancel_booking`, `event_spaces_left` (exact signatures below).

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0018_event_booking.sql
-- Lightweight booking system for free events (see
-- docs/superpowers/specs/2026-09-07-event-booking-design.md). Attendees are
-- a separate identity from profiles (admin/organiser) even though both are
-- Supabase Auth users under the hood — handle_new_user() must branch on the
-- invited role in raw_user_meta_data, otherwise a parent signing in via
-- magic link would silently fall into the trigger's existing "no role
-- metadata -> organiser" default and get organiser dashboard access.

alter table events add column bookable boolean not null default false;
alter table events add column booking_capacity integer;
alter table events add constraint booking_capacity_positive
  check (booking_capacity is null or booking_capacity > 0);

-- ---------- attendees ----------
-- One row per parent/guardian account, keyed by their Supabase Auth user id
-- (not profiles — admin/organiser and attendee are different trust levels
-- and shouldn't share a table or RLS policy set). contact_name/phone are
-- nullable because handle_new_user() below only knows id+email at the
-- moment the auth user is created; the booking action fills them in
-- immediately after via an explicit update.
create table attendees (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  contact_name text,
  phone text,
  created_at timestamptz not null default now()
);

alter table attendees enable row level security;

create policy "attendees can read their own row"
  on attendees for select
  using (auth.uid() = id);

create policy "admins can read all attendees"
  on attendees for select
  using (is_admin());

create policy "organisers can read attendees who booked their events"
  on attendees for select
  using (exists (
    select 1 from bookings
    join events on events.id = bookings.event_id
    where bookings.attendee_id = attendees.id and events.created_by = auth.uid()
  ));

-- ---------- bookings ----------
-- One row per family's signup for one event. signup_status is a distinct
-- type from the existing booking_status_type (events.booking_status,
-- open/planned — an unrelated concept) to avoid confusion between the two.
create type signup_status as enum ('confirmed', 'waitlisted', 'cancelled');

create table bookings (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events (id) on delete cascade,
  attendee_id uuid not null references attendees (id) on delete cascade,
  status signup_status not null,
  created_at timestamptz not null default now()
);

create index bookings_event_id_idx on bookings (event_id);
create index bookings_attendee_id_idx on bookings (attendee_id);

alter table bookings enable row level security;

create policy "attendees can read their own bookings"
  on bookings for select
  using (auth.uid() = attendee_id);

create policy "admins can read all bookings"
  on bookings for select
  using (is_admin());

create policy "organisers can read bookings for their own events"
  on bookings for select
  using (exists (select 1 from events where events.id = bookings.event_id and events.created_by = auth.uid()));

-- No insert/update policies here at all: every write to bookings goes
-- through create_booking()/cancel_booking() below, called via the
-- service-role client or as security definer — never a direct table write
-- from a user session.

-- ---------- booking_people ----------
-- One row per person on a booking (the parent's children). age_category
-- reuses the existing enum from 0001_init.sql.
create table booking_people (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings (id) on delete cascade,
  name text not null,
  age_category age_category not null
);

create index booking_people_booking_id_idx on booking_people (booking_id);

alter table booking_people enable row level security;

create policy "attendees can read their own booking people"
  on booking_people for select
  using (exists (
    select 1 from bookings where bookings.id = booking_people.booking_id and bookings.attendee_id = auth.uid()
  ));

create policy "admins can read all booking people"
  on booking_people for select
  using (is_admin());

create policy "organisers can read booking people for their own events"
  on booking_people for select
  using (exists (
    select 1 from bookings
    join events on events.id = bookings.event_id
    where bookings.id = booking_people.booking_id and events.created_by = auth.uid()
  ));

-- ---------- handle_new_user(): route attendee signups away from profiles ----------
create or replace function handle_new_user() returns trigger as $$
declare
  invited_role text := new.raw_user_meta_data->>'role';
begin
  if invited_role = 'attendee' then
    insert into public.attendees (id, email) values (new.id, new.email);
    return new;
  end if;

  insert into public.profiles (id, email, role)
  values (
    new.id,
    new.email,
    case
      when new.email = 'stevejwikeley@gmail.com' then 'super_admin'
      when invited_role in ('admin', 'organiser') then invited_role::user_role
      else 'organiser'
    end
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- event_spaces_left(): public capacity read without exposing rows ----------
-- No SELECT policy grants public/anon read access to bookings or
-- booking_people (they hold contact details) — the public event page only
-- ever needs a count, so this security definer function returns just that,
-- bypassing RLS internally rather than widening the tables' own policies.
create or replace function event_spaces_left(p_event_id uuid)
returns integer as $$
declare
  v_capacity integer;
  v_confirmed_count integer;
begin
  select booking_capacity into v_capacity from events where id = p_event_id;
  if v_capacity is null then
    return null;
  end if;

  select count(*) into v_confirmed_count
    from bookings b
    join booking_people bp on bp.booking_id = b.id
    where b.event_id = p_event_id and b.status = 'confirmed';

  return greatest(v_capacity - v_confirmed_count, 0);
end;
$$ language plpgsql stable security definer set search_path = public;

grant execute on function event_spaces_left(uuid) to anon, authenticated;

-- ---------- create_booking(): atomic capacity check + insert ----------
-- Only ever called from the createBooking Server Action via the
-- service-role client (it needs the admin API to create the attendee's
-- auth user first, which can't be done from SQL) — never from a user
-- session, so execute is revoked from anon/authenticated below. The
-- advisory lock serializes concurrent calls for the same event so two
-- simultaneous signups can't both see "1 space left" and both claim it.
create or replace function create_booking(
  p_event_id uuid,
  p_attendee_id uuid,
  p_people jsonb
) returns table (booking_id uuid, status text) as $$
declare
  v_capacity integer;
  v_confirmed_count integer;
  v_people_count integer;
  v_status signup_status;
  v_booking_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext(p_event_id::text));

  v_people_count := jsonb_array_length(p_people);
  if v_people_count = 0 then
    raise exception 'At least one person is required.';
  end if;

  select booking_capacity into v_capacity from events where id = p_event_id;

  select count(*) into v_confirmed_count
    from bookings b
    join booking_people bp on bp.booking_id = b.id
    where b.event_id = p_event_id and b.status = 'confirmed';

  if v_capacity is null or v_confirmed_count + v_people_count <= v_capacity then
    v_status := 'confirmed';
  else
    v_status := 'waitlisted';
  end if;

  insert into bookings (event_id, attendee_id, status)
  values (p_event_id, p_attendee_id, v_status)
  returning id into v_booking_id;

  insert into booking_people (booking_id, name, age_category)
  select v_booking_id, p->>'name', (p->>'age_category')::age_category
  from jsonb_array_elements(p_people) as p;

  return query select v_booking_id, v_status::text;
end;
$$ language plpgsql set search_path = public;

revoke execute on function create_booking(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function create_booking(uuid, uuid, jsonb) to service_role;

-- ---------- cancel_booking(): self-service cancel + waitlist promotion ----------
-- security definer because promoting a waitlisted booking updates a row
-- that belongs to a *different* attendee than the one cancelling — a plain
-- RLS-bound update from the caller's own session couldn't do that. The
-- auth.uid() check below is what keeps this safe to expose to any signed-in
-- attendee (same pattern as is_admin() in 0002_auth.sql): a security
-- definer function bypasses RLS entirely, so it must check identity itself.
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
  v_capacity integer;
  v_confirmed_count integer;
  v_freed integer;
  v_candidate record;
  v_promoted_booking_id uuid;
  v_promoted_attendee_id uuid;
begin
  select event_id, attendee_id, status into v_event_id, v_attendee_id, v_prev_status
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

  perform pg_advisory_xact_lock(hashtext(v_event_id::text));

  update bookings set status = 'cancelled' where id = p_booking_id;

  if v_prev_status = 'confirmed' then
    select booking_capacity into v_capacity from events where id = v_event_id;

    if v_capacity is not null then
      select count(*) into v_confirmed_count
        from bookings b
        join booking_people bp on bp.booking_id = b.id
        where b.event_id = v_event_id and b.status = 'confirmed';
      v_freed := v_capacity - v_confirmed_count;

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
  end if;

  return query select v_event_id, v_promoted_booking_id, v_promoted_attendee_id;
end;
$$ language plpgsql security definer set search_path = public;

revoke execute on function cancel_booking(uuid) from public, anon;
grant execute on function cancel_booking(uuid) to authenticated;
```

- [ ] **Step 2: Apply the migration**

Follow `supabase/migrations/README.md`'s existing manual-apply workflow: paste the full contents of `0018_event_booking.sql` into the Supabase Dashboard SQL editor for this project (or use the Supabase MCP `execute_sql`/`apply_migration` tool if this session has an authorized Supabase MCP connection) and run it against the same Supabase project the dev server (`.env.local`) points at.

- [ ] **Step 3: Verify with scratch data, then clean up**

Run this in the same SQL editor (or via MCP `execute_sql`) to sanity-check the whole flow before moving on — it creates two temporary attendees and one temporary event, exercises `create_booking`/`cancel_booking`/`event_spaces_left`, and deletes everything it created:

```sql
do $$
declare
  v_event_id uuid;
  v_attendee_a uuid := gen_random_uuid();
  v_attendee_b uuid := gen_random_uuid();
  v_booking_a uuid;
  v_booking_b uuid;
  v_status_a text;
  v_status_b text;
  v_spaces_before integer;
  v_spaces_after integer;
begin
  insert into auth.users (id, email) values (v_attendee_a, 'scratch-a@example.com');
  insert into auth.users (id, email) values (v_attendee_b, 'scratch-b@example.com');
  insert into attendees (id, email, contact_name) values (v_attendee_a, 'scratch-a@example.com', 'Scratch A');
  insert into attendees (id, email, contact_name) values (v_attendee_b, 'scratch-b@example.com', 'Scratch B');

  insert into events (title, discipline, start_datetime, venue_name, organiser_url, region, approved, bookable, booking_capacity)
  values ('SCRATCH TEST EVENT', 'cx', now() + interval '7 days', 'Test venue', 'https://example.com', 'devon', true, true, 1)
  returning id into v_event_id;

  select event_spaces_left(v_event_id) into v_spaces_before;
  assert v_spaces_before = 1, 'expected 1 space before any booking';

  select booking_id, status into v_booking_a, v_status_a
    from create_booking(v_event_id, v_attendee_a, '[{"name":"Kid A","age_category":"u10"}]'::jsonb);
  assert v_status_a = 'confirmed', 'first booking (1 person, capacity 1) should confirm';

  select booking_id, status into v_booking_b, v_status_b
    from create_booking(v_event_id, v_attendee_b, '[{"name":"Kid B1","age_category":"u10"},{"name":"Kid B2","age_category":"u12"}]'::jsonb);
  assert v_status_b = 'waitlisted', 'second booking (event already full) should waitlist';

  select event_spaces_left(v_event_id) into v_spaces_after;
  assert v_spaces_after = 0, 'expected 0 spaces once confirmed booking fills capacity';

  -- Simulate cancel_booking's auth.uid() check by calling the same logic
  -- directly (auth.uid() is null outside a real request context, so call
  -- the underlying update path this way instead of via the function itself
  -- for this scratch check):
  update bookings set status = 'cancelled' where id = v_booking_a;
  assert (select count(*) from bookings b join booking_people bp on bp.booking_id = b.id where b.event_id = v_event_id and b.status = 'confirmed') = 0,
    'cancelling the only confirmed booking should leave 0 confirmed people';

  raise notice 'create_booking / event_spaces_left checks passed.';

  delete from events where id = v_event_id;
  delete from attendees where id in (v_attendee_a, v_attendee_b);
  delete from auth.users where id in (v_attendee_a, v_attendee_b);
end $$;
```

Expected output: `NOTICE: create_booking / event_spaces_left checks passed.` with no assertion failures. If any `assert` fails, fix the function in `0018_event_booking.sql` and re-run both this step and step 2 (drop/recreate: `drop function create_booking(uuid,uuid,jsonb); drop function event_spaces_left(uuid);` etc. before re-running the file, since `create or replace` doesn't cover a changed return-table signature).

`cancel_booking` itself isn't called directly in this scratch check because it reads `auth.uid()`, which is only populated inside a real PostgREST-authenticated request — its promotion logic (the `for v_candidate in ... loop`) is identical to `create_booking`'s capacity-counting logic already exercised above, and its `auth.uid()` ownership check gets its real test in Task 6's manual verification once a real attendee session exists.

- [ ] **Step 4: Update `lib/supabase/types.ts`**

Add `bookable`/`booking_capacity` to `EventRow`, three new row types, three new `Database["public"]["Tables"]` entries, and a populated `Functions` map (currently `Record<string, never>`):

```ts
// In EventRow, alongside the other columns:
  series_id: string | null;
  occurrence_date: string | null;
  series_detached: boolean;
  bookable: boolean;
  booking_capacity: number | null;
```

```ts
// New types, placed after EventSeriesExceptionRow:
export type SignupStatus = "confirmed" | "waitlisted" | "cancelled";

export interface AttendeeRow {
  id: string;
  email: string;
  contact_name: string | null;
  phone: string | null;
  created_at: string;
}

export interface BookingRow {
  id: string;
  event_id: string;
  attendee_id: string;
  status: SignupStatus;
  created_at: string;
}

export interface BookingPersonRow {
  id: string;
  booking_id: string;
  name: string;
  age_category: AgeCategory;
}
```

```ts
// In Database["public"]["Tables"], alongside the existing entries:
      attendees: { Row: AsRecord<AttendeeRow>; Insert: AsRecord<Partial<AttendeeRow>>; Update: AsRecord<Partial<AttendeeRow>>; Relationships: [] };
      bookings: { Row: AsRecord<BookingRow>; Insert: AsRecord<Partial<BookingRow>>; Update: AsRecord<Partial<BookingRow>>; Relationships: [] };
      booking_people: { Row: AsRecord<BookingPersonRow>; Insert: AsRecord<Partial<BookingPersonRow>>; Update: AsRecord<Partial<BookingPersonRow>>; Relationships: [] };
```

```ts
// Replace `Functions: Record<string, never>;` with:
    Functions: {
      create_booking: {
        Args: { p_event_id: string; p_attendee_id: string; p_people: { name: string; age_category: AgeCategory }[] };
        Returns: { booking_id: string; status: string }[];
      };
      cancel_booking: {
        Args: { p_booking_id: string };
        Returns: { cancelled_event_id: string; promoted_booking_id: string | null; promoted_attendee_id: string | null }[];
      };
      event_spaces_left: {
        Args: { p_event_id: string };
        Returns: number | null;
      };
    };
```

- [ ] **Step 5: Add the migration's row to the README table**

In `supabase/migrations/README.md`, append to the "What's in each migration" table:

```
| `0018_event_booking.sql` | Adds `bookable`/`booking_capacity` to `events`, new `attendees`/`bookings`/`booking_people` tables, and `create_booking()`/`cancel_booking()`/`event_spaces_left()` functions for the native event-booking system. Extends `handle_new_user()` to route `role: 'attendee'` signups into `attendees` instead of `profiles`. |
```

- [ ] **Step 6: Typecheck and commit**

Run: `npx tsc --noEmit`
Expected: no errors referencing `lib/supabase/types.ts` or its consumers.

```bash
git add supabase/migrations/0018_event_booking.sql supabase/migrations/README.md lib/supabase/types.ts
git commit -m "$(cat <<'EOF'
Add booking schema, RLS, and capacity/waitlist functions

Adds attendees/bookings/booking_people tables plus bookable/
booking_capacity on events. Capacity checks and waitlist promotion run
inside create_booking()/cancel_booking() rather than app code, since
supabase-js has no cross-table transactions and an app-level
check-then-insert would race under concurrent signups.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Event description page (`/events/[id]`)

**Files:**
- Create: `app/events/[id]/page.tsx`
- Modify: `components/CalendarPage.tsx` (link each event row's title to its detail page)
- Test: `e2e/event-detail.spec.ts`

**Interfaces:**
- Consumes: `getEventRowById(id): Promise<EventRow | null>` (`lib/data.ts`, existing), `EventRow.bookable`/`booking_capacity` (Task 1).
- Produces: the `/events/[id]` route later tasks embed the signup form into (Task 4).

- [ ] **Step 1: Write the failing test**

```ts
// e2e/event-detail.spec.ts
import { test, expect } from "@playwright/test";

test.describe("Event detail page", () => {
  test("clicking an event on the calendar opens its detail page with the same title", async ({ page }) => {
    await page.goto("/");
    const firstTitle = await page.locator("main .row-hover").first().locator("span").first().textContent();
    await page.locator("main .row-hover").first().locator("a, [role=link]").first().click().catch(() => {});
    // Fallback: navigate directly if the row itself isn't the link target —
    // asserted properly once the title link exists (Step 3).
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    if (firstTitle) {
      await expect(page.getByRole("heading", { level: 1 })).toContainText(firstTitle.trim().slice(0, 10));
    }
  });

  test("a non-existent event id 404s", async ({ page }) => {
    const res = await page.goto("/events/00000000-0000-0000-0000-000000000000");
    expect(res?.status()).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:e2e -- event-detail`
Expected: FAIL — `/events/[id]` doesn't exist yet, so both the click-through and the 404 case fail (no route to 404 from).

- [ ] **Step 3: Read `components/CalendarPage.tsx` to find the event row title, and link it**

Read the file first — it's the single source of the calendar's event rows referenced by `e2e/calendar.spec.ts` (`main a`, `.row-hover`). Wrap the event title text in a `<Link href={`/events/${e.id}`}>` (import `next/link`), keeping the existing booking-link `<a>` untouched (they're two different links on the same row: one to this new detail page, one to book/organiser site).

- [ ] **Step 4: Write the detail page**

```tsx
// app/events/[id]/page.tsx
import { notFound } from "next/navigation";
import { getEventRowById } from "@/lib/data";
import { eventDisc } from "@/lib/mock-data";
import { fmtDay } from "@/lib/format";

export default async function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = await getEventRowById(id);
  if (!event || !event.approved) notFound();

  const d = eventDisc(event.discipline);
  const f = fmtDay(event.start_datetime.slice(0, 10));

  return (
    <header style={{ maxWidth: 720, margin: "0 auto", padding: "56px 24px 120px" }}>
      <div className="mono" style={{ fontSize: 11.5, letterSpacing: "0.12em", color: d.color, marginBottom: 16, fontWeight: 700 }}>
        {f.day} {f.mon} &middot; {d.label.toUpperCase()}
      </div>
      <h1 className="disp" style={{ fontSize: "clamp(28px, 4.5vw, 44px)", lineHeight: 1.05, margin: 0, marginBottom: 20, letterSpacing: "-0.01em" }}>
        {event.title}
      </h1>
      <div style={{ fontSize: 14.5, lineHeight: 1.7, color: "#4A4A46" }}>
        <p><strong>Venue:</strong> {event.venue_name}{event.address ? `, ${event.address}` : ""}</p>
        <p><strong>Ages:</strong> {event.age_categories.map((a) => a.toUpperCase()).join(", ") || "All ages"}</p>
        {event.kids_only && <p>Kids only — no adults racing alongside.</p>}
        {event.organiser_name && <p><strong>Organiser:</strong> {event.organiser_name}</p>}
      </div>

      {!event.bookable && (
        <div style={{ marginTop: 28 }}>
          <a
            href={event.booking_status === "open" ? event.booking_link ?? event.organiser_url : event.organiser_url}
            style={{ display: "inline-block", background: "#111111", color: "#FAFAF8", border: "none", padding: "12px 24px", fontWeight: 700, fontSize: 13.5 }}
          >
            {event.booking_status === "open" ? "Book" : "Organiser's website"}
          </a>
        </div>
      )}
    </header>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test:e2e -- event-detail`
Expected: PASS for both tests.

- [ ] **Step 6: Commit**

```bash
git add app/events/\[id\]/page.tsx components/CalendarPage.tsx e2e/event-detail.spec.ts
git commit -m "$(cat <<'EOF'
Add public event description page

Fills the previously-missing /events/[id] route (only its
suggest-change sub-route existed) with title/date/venue/ages, linked
from each calendar row. Non-bookable events keep the existing
book/organiser-site link; Task 4 adds the signup form for bookable ones.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: "Free event with signup" fields on the event form

**Files:**
- Modify: `components/events/EventForm.tsx`
- Modify: `lib/actions/parse-event-form.ts`
- Modify: `lib/actions/events.ts` (`saveEvent`)

**Interfaces:**
- Consumes: `EventRow.bookable`/`booking_capacity` (Task 1).
- Produces: admin/organiser can toggle `bookable` and set `booking_capacity` on any event they can already edit — this is what makes Task 4's signup form appear on `/events/[id]`.

This task is admin/organiser-gated, and (per the Global Constraints note) this repo's e2e suite doesn't exercise authenticated flows — verify manually per Step 4 below rather than adding a Playwright spec.

- [ ] **Step 1: Add `bookable`/`booking_capacity` to the form's parsed values**

In `lib/actions/parse-event-form.ts`, extend `EventFormValues`:

```ts
export type EventFormValues = Pick<
  EventRow,
  | "title"
  | "discipline"
  | "status"
  | "all_day"
  | "start_datetime"
  | "end_datetime"
  | "venue_name"
  | "address"
  | "postcode"
  | "region"
  | "age_categories"
  | "kids_only"
  | "booking_status"
  | "booking_link"
  | "organiser_url"
  | "organiser_name"
  | "organiser_contact"
  | "bookable"
  | "booking_capacity"
>;
```

Inside `parseEventForm`, after the existing field reads:

```ts
  const bookable = formData.get("bookable") === "on";
  const bookingCapacityRaw = String(formData.get("booking_capacity") ?? "").trim();
  const bookingCapacity = bookingCapacityRaw ? Number(bookingCapacityRaw) : null;
  if (bookable && bookingCapacityRaw && (!Number.isInteger(bookingCapacity) || bookingCapacity! <= 0)) {
    return { ok: false, error: "Space limit must be a whole number greater than zero, or left blank for unlimited." };
  }
```

Add `bookable, booking_capacity: bookingCapacity,` to the returned `values` object.

- [ ] **Step 2: Add the fields to `EventForm.tsx`**

After the existing "ORGANISER NAME/CONTACT" `row` block in `components/events/EventForm.tsx`, before the submit-button `<div>`:

```tsx
      <div style={{ background: "#F3F2EE", border: "1px solid #E4E2DD", padding: "16px 18px", marginBottom: 20 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: bookable ? 14 : 0 }}>
          <input type="checkbox" name="bookable" checked={bookable} onChange={(e) => setBookable(e.target.checked)} />
          Free event with signup on this site
        </label>
        {bookable && (
          <div>
            <label className="mono" style={label}>SPACE LIMIT (OPTIONAL — BLANK = UNLIMITED)</label>
            <input style={{ ...input, maxWidth: 140 }} type="number" min={1} step={1} name="booking_capacity" defaultValue={event?.booking_capacity ?? ""} />
          </div>
        )}
      </div>
```

Add the matching state near the other `useState` calls: `const [bookable, setBookable] = useState(event?.bookable ?? false);`

- [ ] **Step 3: Wire `saveEvent` to persist the new fields**

`lib/actions/events.ts`'s `saveEvent` already spreads `...values` into both the insert and update payloads, so no change is needed there — `values` now includes `bookable`/`booking_capacity` automatically once Step 1 lands. Confirm this by reading the current `saveEvent` body: both branches do `{ ...values, ... }`, not a field-by-field pick.

- [ ] **Step 4: Manual verification**

Start the dev server (`npm run dev`), sign in at `/login` as an existing admin/organiser account, open any event's edit page (`/admin/events/[id]/edit`), check "Free event with signup on this site", set a space limit, save, and reopen the edit page to confirm both the checkbox and the number persisted. Then uncheck it, save, and confirm the number input disappears and `booking_capacity` doesn't block saving when blank.

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add components/events/EventForm.tsx lib/actions/parse-event-form.ts
git commit -m "$(cat <<'EOF'
Add bookable toggle and space limit to the event form

Lets an admin/organiser opt an event into native on-site signup with
an optional capacity, saved via the existing saveEvent path (it
already spreads all parsed values into the insert/update payload).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Signup form, `createBooking` action, and confirmation email

**Files:**
- Create: `lib/actions/parse-booking-form.ts`
- Create: `lib/actions/bookings.ts`
- Create: `lib/email/booking-confirmation.ts`
- Create: `components/events/SignupForm.tsx`
- Modify: `app/events/[id]/page.tsx`
- Modify: `lib/data.ts` (add `getEventSpacesLeft`)
- Test: `e2e/booking-form.spec.ts`

**Interfaces:**
- Consumes: `create_booking` RPC (Task 1), `EventRow.bookable`/`booking_capacity` (Task 1), `sendEmail({to, subject, html})` (`lib/email/resend.ts`, existing).
- Produces: `createBooking(eventId: string, prevState: CreateBookingState, formData: FormData): Promise<CreateBookingState>` — consumed directly by `SignupForm.tsx` here, and by nothing else in this plan (Task 6/7 read bookings via `lib/data.ts`, not this action).

- [ ] **Step 1: Write the failing test (rendering/validation only — see Global Constraints on this repo's e2e ceiling)**

```ts
// e2e/booking-form.spec.ts
import { test, expect } from "@playwright/test";

// No bookable event necessarily exists in the dev database at any given
// time (bookable defaults to false for every event, and this suite never
// writes fixture rows — see Global Constraints), so these tests only cover
// what's true regardless of data: the "book" link/section doesn't appear
// on a non-bookable event, and the calendar keeps working. Capacity/
// waitlist behavior is verified manually (Task 1 Step 3's SQL, and Task 4
// Step 6 below) rather than end-to-end here.
test.describe("Signup form visibility", () => {
  test("a non-bookable event's detail page has no signup form", async ({ page }) => {
    await page.goto("/");
    await page.locator("main .row-hover a").first().click();
    await expect(page).toHaveURL(/\/events\//);
    await expect(page.locator('input[name="contact_name"]')).toHaveCount(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:e2e -- booking-form`
Expected: FAIL if the event clicked happens to already be bookable (unlikely — nothing sets `bookable` yet outside manual testing) — otherwise this may already pass trivially since the form doesn't exist. Confirm by reading the test output; if it already passes, that's expected given nothing renders a signup form yet. Proceed to Step 3 regardless — Steps 3-5 build the form Step 6 verifies manually.

- [ ] **Step 3: `parseBookingForm`**

```ts
// lib/actions/parse-booking-form.ts
import type { AgeCategory } from "@/lib/supabase/types";

export interface BookingPersonInput {
  name: string;
  ageCategory: AgeCategory;
}

export interface BookingFormValues {
  contactName: string;
  email: string;
  phone: string | null;
  people: BookingPersonInput[];
}

// Person rows share input names ("person_name"/"person_age") across every
// row rather than indexed names — same pattern as the "ages" checkboxes in
// parse-event-form.ts — so formData.getAll() returns parallel arrays in
// DOM order regardless of how many rows the client added/removed.
export function parseBookingForm(
  formData: FormData
): { ok: false; error: string } | { ok: true; values: BookingFormValues } {
  const contactName = String(formData.get("contact_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const names = formData.getAll("person_name").map((v) => String(v).trim());
  const ageCategories = formData.getAll("person_age").map((v) => String(v) as AgeCategory);

  if (!contactName) return { ok: false, error: "Your name is required." };
  if (!email) return { ok: false, error: "Email is required." };
  if (names.length === 0) return { ok: false, error: "Add at least one person." };
  if (names.length !== ageCategories.length) return { ok: false, error: "Every person needs an age category." };

  const people = names.map((name, i) => ({ name, ageCategory: ageCategories[i] }));
  if (people.some((p) => !p.name)) return { ok: false, error: "Every person needs a name." };
  if (people.some((p) => !p.ageCategory)) return { ok: false, error: "Every person needs an age category." };

  return { ok: true, values: { contactName, email, phone, people } };
}
```

- [ ] **Step 4: `booking-confirmation.ts` email template**

```ts
// lib/email/booking-confirmation.ts
import "server-only";
import type { EventRow } from "@/lib/supabase/types";
import type { BookingPersonInput } from "@/lib/actions/parse-booking-form";
import { fmtDay } from "@/lib/format";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

// Matches the branded style of the other transactional emails (see
// contact.ts) — paper/ink/accent palette, table-based layout.
export function buildBookingConfirmationHtml(args: {
  event: EventRow;
  status: "confirmed" | "waitlisted";
  people: BookingPersonInput[];
  manageUrl: string;
}): string {
  const { event, status, people, manageUrl } = args;
  const f = fmtDay(event.start_datetime.slice(0, 10));
  const headline = status === "confirmed" ? "You're in." : "You're on the waitlist.";
  const body =
    status === "confirmed"
      ? "Your place is confirmed — see you there."
      : "This event is full right now. We'll email you the moment a space opens up.";
  const peopleList = people.map((p) => `${escapeHtml(p.name)} (${p.ageCategory.toUpperCase()})`).join(", ");

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAFAF8;padding:40px 0;">
  <tr>
    <td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">
        <tr>
          <td style="font-family:Georgia,'Times New Roman',serif;font-weight:bold;font-size:15px;letter-spacing:0.02em;color:#111111;padding-bottom:32px;">
            SOUTH WEST KIDS CYCLING
          </td>
        </tr>
        <tr>
          <td style="font-family:-apple-system,Helvetica,Arial,sans-serif;font-size:11px;font-weight:bold;letter-spacing:0.1em;color:#E0102A;padding-bottom:14px;">
            ${status === "confirmed" ? "BOOKING CONFIRMED" : "WAITLISTED"}
          </td>
        </tr>
        <tr>
          <td style="font-family:Georgia,'Times New Roman',serif;font-weight:bold;font-size:26px;line-height:1.2;color:#111111;padding-bottom:12px;">
            ${headline}
          </td>
        </tr>
        <tr>
          <td style="font-family:-apple-system,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:#4A4A46;padding-bottom:20px;">
            ${body}
          </td>
        </tr>
        <tr>
          <td style="font-family:-apple-system,Helvetica,Arial,sans-serif;font-size:13px;line-height:1.7;color:#111111;border-top:1px solid #E4E2DD;padding-top:16px;padding-bottom:16px;">
            <strong>${escapeHtml(event.title)}</strong><br/>
            ${f.day} ${f.mon} &middot; ${escapeHtml(event.venue_name)}<br/>
            ${escapeHtml(peopleList)}
          </td>
        </tr>
        <tr>
          <td style="padding-top:8px;">
            <a href="${escapeHtml(manageUrl)}" style="display:inline-block;background:#111111;color:#FAFAF8;font-family:-apple-system,Helvetica,Arial,sans-serif;font-weight:bold;font-size:14px;text-decoration:none;padding:13px 26px;">
              View / manage this booking
            </a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
`;
}
```

- [ ] **Step 5: `createBooking` Server Action**

```ts
// lib/actions/bookings.ts
"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { parseBookingForm, type BookingFormValues } from "./parse-booking-form";
import { sendEmail } from "@/lib/email/resend";
import { buildBookingConfirmationHtml } from "@/lib/email/booking-confirmation";
import type { AttendeeRow, EventRow } from "@/lib/supabase/types";

export interface CreateBookingState {
  error?: string;
  success?: { status: "confirmed" | "waitlisted" };
}

async function findOrCreateAttendee(
  admin: ReturnType<typeof createAdminClient>,
  values: BookingFormValues
): Promise<string | null> {
  const { data: existing } = await admin.from("attendees").select("id").eq("email", values.email).maybeSingle();
  let attendeeId = (existing as Pick<AttendeeRow, "id"> | null)?.id ?? null;

  if (!attendeeId) {
    const { data: created, error } = await admin.auth.admin.createUser({
      email: values.email,
      email_confirm: true,
      user_metadata: { role: "attendee" },
    });
    if (error || !created.user) return null;
    attendeeId = created.user.id;
  }

  await admin.from("attendees").update({ contact_name: values.contactName, phone: values.phone }).eq("id", attendeeId);
  return attendeeId;
}

export async function createBooking(
  eventId: string,
  _prevState: CreateBookingState,
  formData: FormData
): Promise<CreateBookingState> {
  const parsed = parseBookingForm(formData);
  if (!parsed.ok) return { error: parsed.error };

  const admin = createAdminClient();

  const { data: eventData, error: eventError } = await admin.from("events").select("*").eq("id", eventId).single();
  const event = eventData as EventRow | null;
  if (eventError || !event || !event.bookable) {
    return { error: "This event isn't taking bookings." };
  }

  const attendeeId = await findOrCreateAttendee(admin, parsed.values);
  if (!attendeeId) return { error: "Couldn't set up your account — try again." };

  const { data: result, error: rpcError } = await admin.rpc("create_booking", {
    p_event_id: eventId,
    p_attendee_id: attendeeId,
    p_people: parsed.values.people.map((p) => ({ name: p.name, age_category: p.ageCategory })),
  });
  if (rpcError || !result || result.length === 0) {
    return { error: rpcError?.message ?? "Couldn't complete the booking." };
  }
  const status = result[0].status as "confirmed" | "waitlisted";

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const { data: linkData } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: parsed.values.email,
    options: { redirectTo: `${siteUrl}/auth/confirm?next=/my-events` },
  });

  try {
    await sendEmail({
      to: parsed.values.email,
      subject: status === "confirmed" ? `You're in: ${event.title}` : `Waitlisted: ${event.title}`,
      html: buildBookingConfirmationHtml({
        event,
        status,
        people: parsed.values.people,
        manageUrl: linkData?.properties?.action_link ?? `${siteUrl}/my-events/login`,
      }),
    });
  } catch {
    // Booking is already saved — an email failure here must not undo it
    // (spec's "Error handling"). Deliberately swallowed, matching how the
    // rest of the app treats transactional email as best-effort.
  }

  return { success: { status } };
}
```

- [ ] **Step 6: `SignupForm.tsx`**

```tsx
// components/events/SignupForm.tsx
"use client";

import { useActionState, useState } from "react";
import { createBooking, type CreateBookingState } from "@/lib/actions/bookings";
import type { AgeCategory } from "@/lib/types";

const AGE_OPTIONS: AgeCategory[] = ["u8", "u10", "u12", "u14", "u16"];
const label: React.CSSProperties = { fontSize: 10.5, color: "#6B6B66", display: "block", marginBottom: 6, letterSpacing: "0.03em" };
const input: React.CSSProperties = { width: "100%", background: "#FFFFFF", border: "1px solid #D8D6D0", color: "#111111", padding: "9px 11px", fontSize: 13.5 };
const field: React.CSSProperties = { marginBottom: 16 };

export default function SignupForm({ eventId, spacesLeft }: { eventId: string; spacesLeft: number | null }) {
  const boundCreate = createBooking.bind(null, eventId);
  const [state, formAction, pending] = useActionState<CreateBookingState, FormData>(boundCreate, {});
  const [peopleCount, setPeopleCount] = useState(1);

  if (state.success) {
    return (
      <div style={{ background: "#F3F2EE", border: "1px solid #E4E2DD", padding: "20px 22px" }}>
        <p style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>
          {state.success.status === "confirmed" ? "You're in — check your email for confirmation." : "You're on the waitlist — check your email."}
        </p>
      </div>
    );
  }

  const full = spacesLeft === 0;

  return (
    <form action={formAction} style={{ maxWidth: 420, background: "#F3F2EE", border: "1px solid #E4E2DD", padding: "20px 22px" }}>
      <h2 className="disp" style={{ fontSize: 18, marginBottom: 4 }}>
        {full ? "Join the waitlist" : "Sign up"}
      </h2>
      {spacesLeft !== null && (
        <p className="mono" style={{ fontSize: 11, color: "#6B6B66", marginBottom: 16 }}>
          {full ? "FULL" : `${spacesLeft} SPACE${spacesLeft === 1 ? "" : "S"} LEFT`}
        </p>
      )}

      <div style={field}>
        <label className="mono" style={label}>YOUR NAME</label>
        <input style={input} name="contact_name" required />
      </div>
      <div style={field}>
        <label className="mono" style={label}>EMAIL</label>
        <input style={input} type="email" name="email" required />
      </div>
      <div style={field}>
        <label className="mono" style={label}>PHONE (OPTIONAL)</label>
        <input style={input} name="phone" />
      </div>

      {Array.from({ length: peopleCount }).map((_, i) => (
        <div key={i} style={{ display: "flex", gap: 10, ...field }}>
          <div style={{ flex: "1 1 60%" }}>
            <label className="mono" style={label}>{i === 0 ? "CHILD'S NAME" : `PERSON ${i + 1} NAME`}</label>
            <input style={input} name="person_name" required />
          </div>
          <div style={{ flex: "1 1 40%" }}>
            <label className="mono" style={label}>AGE</label>
            <select style={input} name="person_age" defaultValue="" required>
              <option value="" disabled>Select…</option>
              {AGE_OPTIONS.map((a) => <option key={a} value={a}>{a.toUpperCase()}</option>)}
            </select>
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={() => setPeopleCount((n) => n + 1)}
        className="mono"
        style={{ fontSize: 11.5, color: "#111111", background: "none", border: "1px solid #D8D6D0", padding: "7px 14px", cursor: "pointer", marginBottom: 18 }}
      >
        + Add another child
      </button>

      <div>
        <button
          type="submit"
          disabled={pending}
          style={{ background: "#111111", color: "#FAFAF8", border: "none", padding: "12px 24px", fontWeight: 700, fontSize: 13.5, cursor: pending ? "default" : "pointer", opacity: pending ? 0.6 : 1 }}
        >
          {pending ? "Submitting…" : full ? "Join waitlist" : "Book now"}
        </button>
      </div>

      {state.error && <p style={{ color: "#A13A2A", fontSize: 12.5, marginTop: 14 }}>{state.error}</p>}
    </form>
  );
}
```

- [ ] **Step 7: `getEventSpacesLeft` and wire the form into the detail page**

In `lib/data.ts`, add:

```ts
export async function getEventSpacesLeft(eventId: string): Promise<number | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("event_spaces_left", { p_event_id: eventId });
  if (error) throw error;
  return data;
}
```

In `app/events/[id]/page.tsx`, import `SignupForm` and `getEventSpacesLeft`, and replace the `{!event.bookable && (...)}` block with:

```tsx
      {event.bookable ? (
        <div style={{ marginTop: 28 }}>
          <SignupForm eventId={event.id} spacesLeft={await getEventSpacesLeft(event.id)} />
        </div>
      ) : (
        <div style={{ marginTop: 28 }}>
          <a
            href={event.booking_status === "open" ? event.booking_link ?? event.organiser_url : event.organiser_url}
            style={{ display: "inline-block", background: "#111111", color: "#FAFAF8", border: "none", padding: "12px 24px", fontWeight: 700, fontSize: 13.5 }}
          >
            {event.booking_status === "open" ? "Book" : "Organiser's website"}
          </a>
        </div>
      )}
```

- [ ] **Step 8: Run the Step 1 test again**

Run: `npm run test:e2e -- booking-form`
Expected: PASS — every real event in the dev DB is still non-bookable by default, so no signup form renders.

- [ ] **Step 9: Manual verification of the full booking + capacity + waitlist flow**

Using an event marked bookable with capacity 1 (set via Task 3's admin UI), in a browser:
1. Submit the signup form with one person's details. Confirm the success message says "You're in" and (if `RESEND_API_KEY`/`RESEND_FROM_EMAIL` are configured) a confirmation email arrives with the correct event details and a working magic link.
2. Reload the page and submit a second signup. Confirm it now says "You're on the waitlist" (capacity 1 is full) and the waitlist email variant arrives.
3. Confirm `spacesLeft` shown on the page reads `0` after step 1's submission.

- [ ] **Step 10: Typecheck and commit**

Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add lib/actions/parse-booking-form.ts lib/actions/bookings.ts lib/email/booking-confirmation.ts components/events/SignupForm.tsx app/events/\[id\]/page.tsx lib/data.ts e2e/booking-form.spec.ts
git commit -m "$(cat <<'EOF'
Add signup form, createBooking action, and confirmation email

Guest checkout: no login required to book. createBooking creates the
attendee's account via the Supabase Admin API (email_confirm: true, so
no Supabase-sent email — the app's own Resend confirmation carries a
generated magic link instead), then calls create_booking() for the
atomic capacity check.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Attendee login and session helper

**Files:**
- Create: `app/my-events/login/page.tsx`
- Modify: `lib/auth.ts` (add `getCurrentAttendee`)
- Test: `e2e/my-events-auth.spec.ts`

**Interfaces:**
- Produces: `getCurrentAttendee(): Promise<AttendeeRow | null>` — consumed by Task 6's dashboard layout.

- [ ] **Step 1: Write the failing test**

```ts
// e2e/my-events-auth.spec.ts
import { test, expect } from "@playwright/test";

test.describe("Attendee area", () => {
  test("/my-events redirects to /my-events/login when logged out", async ({ page }) => {
    await page.goto("/my-events");
    await expect(page).toHaveURL(/\/my-events\/login/);
  });

  test("login page sends a magic link", async ({ page }) => {
    await page.goto("/my-events/login");
    await page.locator('input[type="email"]').fill("e2e-attendee@example.com");
    await page.getByRole("button", { name: /send sign-in link/i }).click();
    await expect(page.getByText(/check.*for a sign-in link/i)).toBeVisible({ timeout: 10_000 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:e2e -- my-events-auth`
Expected: FAIL — `/my-events` doesn't exist yet (404, not a redirect).

- [ ] **Step 3: `getCurrentAttendee` in `lib/auth.ts`**

```ts
import type { AttendeeRow, ProfileRow } from "@/lib/supabase/types";

export const getCurrentAttendee = cache(async (): Promise<AttendeeRow | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data } = await supabase.from("attendees").select("*").eq("id", user.id).single();
  return data as AttendeeRow | null;
});
```

(Add `AttendeeRow` to the existing `import type { ProfileRow } from "@/lib/supabase/types"` line rather than a second import statement.)

- [ ] **Step 4: `app/my-events/login/page.tsx`**

Mirrors `app/login/page.tsx`, with attendee-specific copy and `data: { role: "attendee" }` in the OTP call so a brand-new attendee who logs in before ever booking anything still lands in `attendees`, not `profiles` (the same `handle_new_user()` branch Task 1 added for the booking-created path):

```tsx
// app/my-events/login/page.tsx
"use client";

import { Suspense, useState } from "react";
import { createClient } from "@/lib/supabase/client";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("sending");
    setErrorMessage("");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/confirm?next=/my-events`,
        data: { role: "attendee" },
      },
    });

    if (error) {
      setStatus("error");
      setErrorMessage(error.message);
    } else {
      setStatus("sent");
    }
  };

  return (
    <header style={{ maxWidth: 1100, margin: "0 auto", padding: "80px 24px 120px" }}>
      <div className="mono" style={{ fontSize: 11.5, letterSpacing: "0.12em", color: "#E0102A", marginBottom: 16, fontWeight: 700 }}>MY BOOKINGS SIGN IN</div>
      <h1 className="disp" style={{ fontSize: "clamp(32px, 5.2vw, 52px)", lineHeight: 1.02, margin: 0, letterSpacing: "-0.01em" }}>
        Sign in.
      </h1>

      {status === "sent" ? (
        <p style={{ maxWidth: 420, fontSize: 15, lineHeight: 1.6, color: "#4A4A46", marginTop: 22 }}>
          Check <strong>{email}</strong> for a sign-in link. It&apos;ll log you straight in — no password needed.
        </p>
      ) : (
        <form onSubmit={handleSubmit} style={{ maxWidth: 360, marginTop: 28 }}>
          <label className="mono" style={{ fontSize: 10.5, color: "#6B6B66", display: "block", marginBottom: 6 }}>EMAIL</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            style={{ width: "100%", background: "#FFFFFF", border: "1px solid #D8D6D0", color: "#111111", padding: "10px 12px", fontSize: 14, marginBottom: 14 }}
          />
          <button
            type="submit"
            disabled={status === "sending"}
            style={{ background: "#111111", color: "#FAFAF8", border: "none", padding: "12px 22px", fontWeight: 700, fontSize: 13.5, cursor: status === "sending" ? "default" : "pointer", opacity: status === "sending" ? 0.6 : 1 }}
          >
            {status === "sending" ? "Sending…" : "Send sign-in link"}
          </button>
          {status === "error" && (
            <p style={{ color: "#A13A2A", fontSize: 12.5, marginTop: 12 }}>{errorMessage}</p>
          )}
        </form>
      )}
    </header>
  );
}

export default function MyEventsLoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
```

- [ ] **Step 5: `app/my-events/layout.tsx` (auth gate, built now so Step 1's redirect test passes; `page.tsx` itself lands in Task 6)**

```tsx
// app/my-events/layout.tsx
import { redirect } from "next/navigation";
import { getCurrentAttendee } from "@/lib/auth";

export default async function MyEventsLayout({ children }: { children: React.ReactNode }) {
  const attendee = await getCurrentAttendee();
  if (!attendee) redirect("/my-events/login");
  return <>{children}</>;
}
```

Also create a placeholder-free minimal `app/my-events/page.tsx` so the route resolves for Step 1's test (Task 6 replaces this with the real dashboard):

```tsx
// app/my-events/page.tsx
export default function MyEventsPage() {
  return <header style={{ maxWidth: 1100, margin: "0 auto", padding: "56px 24px 120px" }}>Loading…</header>;
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm run test:e2e -- my-events-auth`
Expected: PASS for both tests. The second test only asserts the client-side "sent" state (matching `contact.spec.ts`'s pattern of not depending on actually receiving the email) — it works regardless of whether Resend/Supabase SMTP is configured in the test environment, since `signInWithOtp` returning success only depends on Supabase Auth, not on email delivery succeeding.

- [ ] **Step 7: Typecheck and commit**

Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add app/my-events/login/page.tsx app/my-events/layout.tsx app/my-events/page.tsx lib/auth.ts e2e/my-events-auth.spec.ts
git commit -m "$(cat <<'EOF'
Add attendee login and session helper

Mirrors the existing admin/organiser magic-link login, but tags the
OTP call with role: 'attendee' so a brand-new attendee who signs in
before ever booking anything still lands in the attendees table
instead of falling into handle_new_user()'s organiser default.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Attendee dashboard, self-service cancel, and waitlist promotion email

**Files:**
- Modify: `app/my-events/page.tsx` (replace the Task 5 placeholder)
- Modify: `lib/data.ts` (add `getMyBookings`)
- Modify: `lib/actions/bookings.ts` (add `cancelBooking`)
- Create: `lib/email/waitlist-promoted.ts`
- Create: `components/events/MyBookingsList.tsx`

**Interfaces:**
- Consumes: `getCurrentAttendee()` (Task 5), `cancel_booking` RPC (Task 1).
- Produces: `cancelBooking(bookingId: string): Promise<{ error?: string }>`.

Gated behind a real attendee session — per Global Constraints, verify manually rather than via Playwright (no precedent in this repo for automating a magic-link login).

- [ ] **Step 1: `getMyBookings` in `lib/data.ts`**

```ts
export interface MyBooking {
  id: string;
  status: SignupStatus;
  event: Pick<EventRow, "id" | "title" | "start_datetime" | "venue_name">;
  people: Pick<BookingPersonRow, "name" | "age_category">[];
}

export async function getMyBookings(attendeeId: string): Promise<MyBooking[]> {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("bookings")
    .select("id, status, event:events!inner(id, title, start_datetime, venue_name), people:booking_people(name, age_category)")
    .eq("attendee_id", attendeeId)
    .neq("status", "cancelled")
    .gte("events.start_datetime", today)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data as unknown as MyBooking[];
}
```

Add `SignupStatus`, `BookingPersonRow` to the existing `import type {...} from "@/lib/supabase/types"` line in `lib/data.ts`.

- [ ] **Step 2: `cancelBooking` action and waitlist-promotion email**

```ts
// lib/email/waitlist-promoted.ts
import "server-only";
import type { EventRow } from "@/lib/supabase/types";
import { fmtDay } from "@/lib/format";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function buildWaitlistPromotedHtml(event: EventRow, manageUrl: string): string {
  const f = fmtDay(event.start_datetime.slice(0, 10));
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAFAF8;padding:40px 0;">
  <tr>
    <td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">
        <tr>
          <td style="font-family:Georgia,'Times New Roman',serif;font-weight:bold;font-size:15px;letter-spacing:0.02em;color:#111111;padding-bottom:32px;">
            SOUTH WEST KIDS CYCLING
          </td>
        </tr>
        <tr>
          <td style="font-family:-apple-system,Helvetica,Arial,sans-serif;font-size:11px;font-weight:bold;letter-spacing:0.1em;color:#1F5D3A;padding-bottom:14px;">
            A SPACE OPENED UP
          </td>
        </tr>
        <tr>
          <td style="font-family:Georgia,'Times New Roman',serif;font-weight:bold;font-size:26px;line-height:1.2;color:#111111;padding-bottom:12px;">
            You're in!
          </td>
        </tr>
        <tr>
          <td style="font-family:-apple-system,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:#4A4A46;padding-bottom:20px;">
            A space opened up for <strong>${escapeHtml(event.title)}</strong> (${f.day} ${f.mon}, ${escapeHtml(event.venue_name)}) and your booking is now confirmed.
          </td>
        </tr>
        <tr>
          <td>
            <a href="${escapeHtml(manageUrl)}" style="display:inline-block;background:#111111;color:#FAFAF8;font-family:-apple-system,Helvetica,Arial,sans-serif;font-weight:bold;font-size:14px;text-decoration:none;padding:13px 26px;">
              View your booking
            </a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
`;
}
```

Append to `lib/actions/bookings.ts`:

```ts
import { createClient } from "@/lib/supabase/server";
import { buildWaitlistPromotedHtml } from "@/lib/email/waitlist-promoted";

export interface CancelBookingResult {
  error?: string;
}

export async function cancelBooking(bookingId: string): Promise<CancelBookingResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { data, error } = await supabase.rpc("cancel_booking", { p_booking_id: bookingId });
  if (error) return { error: error.message };

  const promoted = data?.[0];
  if (promoted?.promoted_booking_id && promoted.promoted_attendee_id) {
    // The promoted booking belongs to a *different* attendee than the
    // caller — reading their email needs the service-role client, since
    // the caller's own RLS-bound session can't see another attendee's row.
    const admin = createAdminClient();
    const [{ data: attendee }, { data: event }] = await Promise.all([
      admin.from("attendees").select("email").eq("id", promoted.promoted_attendee_id).single(),
      admin.from("events").select("*").eq("id", promoted.cancelled_event_id).single(),
    ]);

    if (attendee && event) {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
      const { data: linkData } = await admin.auth.admin.generateLink({
        type: "magiclink",
        email: (attendee as { email: string }).email,
        options: { redirectTo: `${siteUrl}/auth/confirm?next=/my-events` },
      });
      try {
        await sendEmail({
          to: (attendee as { email: string }).email,
          subject: `You're in: ${(event as EventRow).title}`,
          html: buildWaitlistPromotedHtml(event as EventRow, linkData?.properties?.action_link ?? `${siteUrl}/my-events/login`),
        });
      } catch {
        // Best-effort, same as createBooking's confirmation email.
      }
    }
  }

  return {};
}
```

(`createAdminClient` is already imported at the top of `lib/actions/bookings.ts` from Task 4 — only the two new imports shown above need adding.)

- [ ] **Step 3: `MyBookingsList.tsx`**

```tsx
// components/events/MyBookingsList.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cancelBooking } from "@/lib/actions/bookings";
import { fmtDay } from "@/lib/format";
import type { MyBooking } from "@/lib/data";

export default function MyBookingsList({ bookings }: { bookings: MyBooking[] }) {
  const router = useRouter();
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});

  if (bookings.length === 0) {
    return <p style={{ color: "#6B6B66", fontSize: 13.5 }}>No upcoming bookings.</p>;
  }

  async function handleCancel(id: string) {
    if (!confirm("Cancel this booking?")) return;
    setBusyIds((prev) => new Set(prev).add(id));
    const result = await cancelBooking(id);
    if (result.error) {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setErrors((prev) => ({ ...prev, [id]: result.error! }));
      return;
    }
    router.refresh();
  }

  return (
    <div style={{ borderTop: "2px solid #111111" }}>
      {bookings.map((b) => {
        const f = fmtDay(b.event.start_datetime.slice(0, 10));
        const busy = busyIds.has(b.id);
        return (
          <div key={b.id} style={{ padding: "16px 6px", borderBottom: "1px solid #E4E2DD" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{b.event.title}</div>
                <div className="mono" style={{ fontSize: 11.5, color: "#6B6B66", marginTop: 4 }}>
                  {f.day} {f.mon} &middot; {b.event.venue_name} &middot; {b.status === "waitlisted" ? "WAITLISTED" : "CONFIRMED"}
                </div>
                <div style={{ fontSize: 13, color: "#4A4A46", marginTop: 6 }}>
                  {b.people.map((p) => `${p.name} (${p.age_category.toUpperCase()})`).join(", ")}
                </div>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => handleCancel(b.id)}
                className="mono"
                style={{ fontSize: 11.5, color: "#A13A2A", background: "none", border: "1px solid #D8D6D0", padding: "7px 14px", cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1 }}
              >
                {busy ? "Cancelling…" : "Cancel"}
              </button>
            </div>
            {errors[b.id] && <div style={{ fontSize: 12, color: "#A13A2A", marginTop: 6 }}>{errors[b.id]}</div>}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Replace the `app/my-events/page.tsx` placeholder**

```tsx
// app/my-events/page.tsx
import { getCurrentAttendee } from "@/lib/auth";
import { getMyBookings } from "@/lib/data";
import MyBookingsList from "@/components/events/MyBookingsList";

export default async function MyEventsPage() {
  const attendee = await getCurrentAttendee();
  const bookings = attendee ? await getMyBookings(attendee.id) : [];

  return (
    <header style={{ maxWidth: 1100, margin: "0 auto", padding: "56px 24px 120px" }}>
      <div className="mono" style={{ fontSize: 11.5, letterSpacing: "0.12em", color: "#E0102A", marginBottom: 16, fontWeight: 700 }}>MY BOOKINGS</div>
      <h1 className="disp" style={{ fontSize: "clamp(32px, 5.2vw, 52px)", lineHeight: 1.02, margin: 0, letterSpacing: "-0.01em" }}>
        Your events.
      </h1>
      <p style={{ maxWidth: 480, fontSize: 14, lineHeight: 1.6, color: "#4A4A46", marginTop: 22 }}>
        Signed in as {attendee?.email}.
      </p>
      <div style={{ marginTop: 36 }}>
        <MyBookingsList bookings={bookings} />
      </div>
    </header>
  );
}
```

- [ ] **Step 5: Manual verification**

Using the same test event from Task 4 Step 9 (capacity 1, one confirmed booking, one waitlisted booking):
1. Follow the confirmed booking's confirmation email's magic link. Confirm it lands on `/my-events` showing that one booking.
2. Click "Cancel". Confirm the booking disappears from the list, and the previously-waitlisted attendee's email address receives the "You're in!" promotion email with a working magic link.
3. Follow that promoted attendee's magic link and confirm their `/my-events` now shows the booking as confirmed.

- [ ] **Step 6: Typecheck and commit**

Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add app/my-events/page.tsx lib/data.ts lib/actions/bookings.ts lib/email/waitlist-promoted.ts components/events/MyBookingsList.tsx
git commit -m "$(cat <<'EOF'
Add attendee dashboard, self-service cancel, and waitlist promotion

cancelBooking calls cancel_booking() (security definer, since
promoting the next waitlisted booking writes to a different
attendee's row than the caller's own RLS-bound session could reach),
then emails whoever got promoted.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Admin/organiser Attendees tab with CSV export

**Files:**
- Create: `components/events/AttendeesList.tsx`
- Create: `app/admin/events/[id]/attendees/page.tsx`
- Create: `app/organiser/events/[id]/attendees/page.tsx`
- Modify: `lib/data.ts` (add `getBookingsForEvent`)
- Modify: `lib/csv.ts` (add `bookingsToCsv`)
- Modify: `components/events/EventList.tsx` (add an "Attendees" link, shown only for bookable events)

**Interfaces:**
- Consumes: RLS policies from Task 1 (organiser/admin read access to `bookings`/`booking_people`/`attendees` for events they can manage) — no service-role client needed here, matching the rest of the app's "RLS is the real boundary" convention.
- Produces: nothing consumed by later tasks in this plan (Task 8 has its own data access, described there).

Admin/organiser-gated — verify manually per Step 5, no Playwright coverage (see Global Constraints).

- [ ] **Step 1: `getBookingsForEvent` in `lib/data.ts`**

```ts
export interface EventBooking {
  id: string;
  status: SignupStatus;
  contactName: string | null;
  email: string;
  phone: string | null;
  people: Pick<BookingPersonRow, "name" | "age_category">[];
}

export async function getBookingsForEvent(eventId: string): Promise<EventBooking[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bookings")
    .select("id, status, attendee:attendees(contact_name, email, phone), people:booking_people(name, age_category)")
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data as unknown as { id: string; status: SignupStatus; attendee: { contact_name: string | null; email: string; phone: string | null }; people: Pick<BookingPersonRow, "name" | "age_category">[] }[]).map(
    (row) => ({
      id: row.id,
      status: row.status,
      contactName: row.attendee.contact_name,
      email: row.attendee.email,
      phone: row.attendee.phone,
      people: row.people,
    })
  );
}
```

- [ ] **Step 2: `bookingsToCsv` in `lib/csv.ts`**

```ts
import type { EventBooking } from "./data";

export function bookingsToCsv(bookings: EventBooking[]): string {
  const headers = ["Contact name", "Contact email", "Contact phone", "Person name", "Age category", "Status"];
  const rows = bookings.flatMap((b) =>
    b.people.map((p) => [b.contactName ?? "", b.email, b.phone ?? "", p.name, p.age_category, b.status])
  );
  return [headers, ...rows].map((row) => row.map(String).map(csvEscape).join(",")).join("\n");
}
```

(`csvEscape` is already defined and unexported at the top of `lib/csv.ts` — reuse it, don't redefine.)

- [ ] **Step 3: `AttendeesList.tsx`**

```tsx
// components/events/AttendeesList.tsx
"use client";

import { downloadCsv } from "@/lib/csv";
import { bookingsToCsv } from "@/lib/csv";
import type { EventBooking } from "@/lib/data";

export default function AttendeesList({ eventTitle, bookings, capacity }: { eventTitle: string; bookings: EventBooking[]; capacity: number | null }) {
  const confirmedCount = bookings.filter((b) => b.status === "confirmed").reduce((sum, b) => sum + b.people.length, 0);
  const waitlistedCount = bookings.filter((b) => b.status === "waitlisted").reduce((sum, b) => sum + b.people.length, 0);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 18 }}>
        <p className="mono" style={{ fontSize: 12, color: "#6B6B66" }}>
          {confirmedCount} confirmed{waitlistedCount > 0 ? `, ${waitlistedCount} waitlisted` : ""}{capacity !== null ? ` / ${capacity} capacity` : ""}
        </p>
        <button
          type="button"
          onClick={() => downloadCsv(`${eventTitle}-attendees.csv`, bookingsToCsv(bookings))}
          className="mono"
          style={{ fontSize: 11.5, fontWeight: 700, color: "#111111", background: "none", border: "1px solid #111111", padding: "8px 16px", cursor: "pointer" }}
        >
          Export CSV
        </button>
      </div>

      {bookings.length === 0 ? (
        <p style={{ color: "#6B6B66", fontSize: 13.5 }}>No signups yet.</p>
      ) : (
        <div style={{ borderTop: "2px solid #111111" }}>
          {bookings.map((b) => (
            <div key={b.id} style={{ padding: "14px 6px", borderBottom: "1px solid #E4E2DD" }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{b.contactName ?? b.email}</div>
              <div className="mono" style={{ fontSize: 10.5, color: "#6B6B66", marginTop: 4 }}>
                {b.email}{b.phone ? ` · ${b.phone}` : ""} · {b.status.toUpperCase()}
              </div>
              <div style={{ fontSize: 13, color: "#4A4A46", marginTop: 6 }}>
                {b.people.map((p) => `${p.name} (${p.age_category.toUpperCase()})`).join(", ")}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Admin and organiser attendees pages**

```tsx
// app/admin/events/[id]/attendees/page.tsx
import { notFound } from "next/navigation";
import { getEventRowById, getBookingsForEvent } from "@/lib/data";
import AttendeesList from "@/components/events/AttendeesList";

export default async function AdminAttendeesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = await getEventRowById(id);
  if (!event) notFound();
  const bookings = await getBookingsForEvent(id);

  return (
    <header style={{ maxWidth: 1100, margin: "0 auto", padding: "56px 24px 120px" }}>
      <div className="mono" style={{ fontSize: 11.5, letterSpacing: "0.12em", color: "#E0102A", marginBottom: 16, fontWeight: 700 }}>ADMIN</div>
      <h1 className="disp" style={{ fontSize: "clamp(28px, 4.5vw, 40px)", lineHeight: 1.05, margin: 0, marginBottom: 28, letterSpacing: "-0.01em" }}>
        Attendees — {event.title}
      </h1>
      <AttendeesList eventTitle={event.title} bookings={bookings} capacity={event.booking_capacity} />
    </header>
  );
}
```

```tsx
// app/organiser/events/[id]/attendees/page.tsx
import { notFound } from "next/navigation";
import { getEventRowById, getBookingsForEvent } from "@/lib/data";
import AttendeesList from "@/components/events/AttendeesList";

export default async function OrganiserAttendeesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = await getEventRowById(id);
  if (!event) notFound();
  const bookings = await getBookingsForEvent(id);

  return (
    <header style={{ maxWidth: 1100, margin: "0 auto", padding: "56px 24px 120px" }}>
      <div className="mono" style={{ fontSize: 11.5, letterSpacing: "0.12em", color: "#E0102A", marginBottom: 16, fontWeight: 700 }}>ORGANISER</div>
      <h1 className="disp" style={{ fontSize: "clamp(28px, 4.5vw, 40px)", lineHeight: 1.05, margin: 0, marginBottom: 28, letterSpacing: "-0.01em" }}>
        Attendees — {event.title}
      </h1>
      <AttendeesList eventTitle={event.title} bookings={bookings} capacity={event.booking_capacity} />
    </header>
  );
}
```

Both rely entirely on RLS to scope `getEventRowById`/`getBookingsForEvent` to what the signed-in organiser/admin is allowed to see (Task 1's policies) — an organiser hitting another organiser's event id gets `notFound()` because `getEventRowById` returns `null` under RLS, same pattern the existing edit pages already use.

- [ ] **Step 5: Add the nav link in `EventList.tsx`, then manually verify**

In `components/events/EventList.tsx`, next to the existing `Edit` link:

```tsx
              {e.bookable && (
                <Link href={`${editBasePath}/${e.id}/attendees`} className="mono" style={{ fontSize: 11.5, fontWeight: 700, color: "#111111", border: "1px solid #111111", padding: "7px 14px" }}>
                  Attendees
                </Link>
              )}
```

Manually verify: sign in as the organiser/admin who marked the Task 4 test event bookable, click "Attendees" from their event list, confirm both the confirmed and waitlisted bookings show with correct people/status, and that "Export CSV" downloads a file with one row per person.

- [ ] **Step 6: Typecheck and commit**

Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add components/events/AttendeesList.tsx app/admin/events/\[id\]/attendees/page.tsx app/organiser/events/\[id\]/attendees/page.tsx lib/data.ts lib/csv.ts components/events/EventList.tsx
git commit -m "$(cat <<'EOF'
Add admin/organiser attendees list with CSV export

Relies entirely on the Task 1 RLS policies to scope which bookings an
organiser can see (their own events only) vs. an admin (everything) —
no service-role client needed, matching the rest of the app's RLS-as-
security-boundary convention.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Message-attendees broadcast

**Files:**
- Create: `components/events/MessageAttendeesForm.tsx`
- Create: `lib/email/attendee-message.ts`
- Modify: `lib/actions/bookings.ts` (add `messageAttendees`)
- Modify: `app/admin/events/[id]/attendees/page.tsx` and `app/organiser/events/[id]/attendees/page.tsx` (render the form)

**Interfaces:**
- Consumes: `getCurrentProfile()`, `isAdminRole()` (existing, `lib/auth.ts`), the same RLS-scoped `bookings`/`attendees` read access as Task 7.

Admin/organiser-gated — verify manually (Step 4), no Playwright coverage.

- [ ] **Step 1: `attendee-message.ts` email template**

```ts
// lib/email/attendee-message.ts
import "server-only";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

// Wraps an organiser-authored plain-text message in the branded shell — no
// further templating, matching the spec's "no rich templating" scope.
export function buildAttendeeMessageHtml(eventTitle: string, body: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAFAF8;padding:40px 0;">
  <tr>
    <td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">
        <tr>
          <td style="font-family:Georgia,'Times New Roman',serif;font-weight:bold;font-size:15px;letter-spacing:0.02em;color:#111111;padding-bottom:32px;">
            SOUTH WEST KIDS CYCLING
          </td>
        </tr>
        <tr>
          <td style="font-family:-apple-system,Helvetica,Arial,sans-serif;font-size:11px;font-weight:bold;letter-spacing:0.1em;color:#E0102A;padding-bottom:14px;">
            MESSAGE ABOUT ${escapeHtml(eventTitle.toUpperCase())}
          </td>
        </tr>
        <tr>
          <td style="font-family:-apple-system,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.7;color:#111111;white-space:pre-wrap;">
            ${escapeHtml(body)}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
`;
}
```

- [ ] **Step 2: `messageAttendees` action**

Append to `lib/actions/bookings.ts`:

```ts
import { getCurrentProfile, isAdminRole } from "@/lib/auth";
import { buildAttendeeMessageHtml } from "@/lib/email/attendee-message";

export interface MessageAttendeesState {
  error?: string;
  success?: string;
}

export async function messageAttendees(
  eventId: string,
  _prevState: MessageAttendeesState,
  formData: FormData
): Promise<MessageAttendeesState> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Not signed in." };

  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (!subject) return { error: "Subject is required." };
  if (!body) return { error: "Message is required." };

  // RLS (Task 1) already scopes this select to events the caller is allowed
  // to manage — an organiser querying another organiser's event id, or a
  // non-admin/non-owner at all, gets zero rows back rather than an error,
  // same defense-in-depth pattern the rest of the app relies on.
  const supabase = await createClient();
  const { data: event, error: eventError } = await supabase.from("events").select("id, title, created_by").eq("id", eventId).single();
  if (eventError || !event) return { error: "Event not found." };
  if (!isAdminRole(profile) && event.created_by !== profile.id) return { error: "Not authorised." };

  const { data: attendeeRows, error: attendeesError } = await supabase
    .from("bookings")
    .select("attendee:attendees(email)")
    .eq("event_id", eventId)
    .eq("status", "confirmed");
  if (attendeesError) return { error: attendeesError.message };

  const emails = [...new Set((attendeeRows as unknown as { attendee: { email: string } }[]).map((r) => r.attendee.email))];
  if (emails.length === 0) return { error: "No confirmed attendees to message yet." };

  const html = buildAttendeeMessageHtml(event.title, body);
  let sent = 0;
  for (const to of emails) {
    try {
      await sendEmail({ to, subject, html });
      sent++;
    } catch {
      // Best-effort per recipient, same pattern as the monthly-digest cron's
      // per-subscriber loop — one bad address shouldn't block the rest.
    }
  }

  return { success: `Sent to ${sent} of ${emails.length} attendee${emails.length === 1 ? "" : "s"}.` };
}
```

- [ ] **Step 3: `MessageAttendeesForm.tsx`, wired into both attendees pages**

```tsx
// components/events/MessageAttendeesForm.tsx
"use client";

import { useActionState } from "react";
import { messageAttendees, type MessageAttendeesState } from "@/lib/actions/bookings";

const label: React.CSSProperties = { fontSize: 10.5, color: "#6B6B66", display: "block", marginBottom: 6, letterSpacing: "0.03em" };
const input: React.CSSProperties = { width: "100%", background: "#FFFFFF", border: "1px solid #D8D6D0", color: "#111111", padding: "9px 11px", fontSize: 13.5 };

export default function MessageAttendeesForm({ eventId }: { eventId: string }) {
  const boundMessage = messageAttendees.bind(null, eventId);
  const [state, formAction, pending] = useActionState<MessageAttendeesState, FormData>(boundMessage, {});

  return (
    <form action={formAction} style={{ maxWidth: 480, marginTop: 32, background: "#F3F2EE", border: "1px solid #E4E2DD", padding: "18px 20px" }}>
      <h3 className="disp" style={{ fontSize: 16, marginBottom: 14 }}>Message attendees</h3>
      <div style={{ marginBottom: 14 }}>
        <label className="mono" style={label}>SUBJECT</label>
        <input style={input} name="subject" required />
      </div>
      <div style={{ marginBottom: 14 }}>
        <label className="mono" style={label}>MESSAGE</label>
        <textarea style={{ ...input, minHeight: 100 }} name="body" required />
      </div>
      <button
        type="submit"
        disabled={pending}
        style={{ background: "#111111", color: "#FAFAF8", border: "none", padding: "11px 20px", fontWeight: 700, fontSize: 13, cursor: pending ? "default" : "pointer", opacity: pending ? 0.6 : 1 }}
      >
        {pending ? "Sending…" : "Send to confirmed attendees"}
      </button>
      {state.success && <p style={{ color: "#1F5D3A", fontSize: 12.5, marginTop: 12 }}>{state.success}</p>}
      {state.error && <p style={{ color: "#A13A2A", fontSize: 12.5, marginTop: 12 }}>{state.error}</p>}
    </form>
  );
}
```

Add `<MessageAttendeesForm eventId={id} />` at the bottom of both `app/admin/events/[id]/attendees/page.tsx` and `app/organiser/events/[id]/attendees/page.tsx` (after `<AttendeesList .../>`), and import it there.

- [ ] **Step 4: Manual verification**

From the Task 7 attendees page, send a test message. Confirm the confirmed attendee (not the waitlisted one) receives it with the entered subject/body, and the success message reports "Sent to 1 of 1 attendee".

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add components/events/MessageAttendeesForm.tsx lib/email/attendee-message.ts lib/actions/bookings.ts app/admin/events/\[id\]/attendees/page.tsx app/organiser/events/\[id\]/attendees/page.tsx
git commit -m "$(cat <<'EOF'
Add message-attendees broadcast for admin/organiser

Plain subject+body email to every confirmed attendee of one event,
per-recipient best-effort send matching the monthly-digest cron's
existing per-subscriber loop pattern.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Day-before reminder cron

**Files:**
- Create: `lib/email/booking-reminder.ts`
- Create: `app/api/cron/booking-reminders/route.ts`
- Modify: `lib/uk-time.ts` (add `ukTomorrowDateIso`)
- Modify: `vercel.json`

**Interfaces:**
- Consumes: `createAdminClient()` (existing), `CRON_SECRET` env var (existing convention, matches every other cron route).

No login involved, but this route is designed to be hit only by Vercel Cron with a bearer secret — verify by curl (Step 4), matching how this repo's existing four cron routes have no e2e coverage either.

- [ ] **Step 1: `ukTomorrowDateIso` in `lib/uk-time.ts`**

```ts
export function ukTomorrowDateIso(): string {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" });
  const parts = fmt.formatToParts(new Date()).reduce<Record<string, string>>((acc, p) => {
    acc[p.type] = p.value;
    return acc;
  }, {});
  const today = new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00.000Z`);
  today.setUTCDate(today.getUTCDate() + 1);
  return today.toISOString().slice(0, 10);
}
```

- [ ] **Step 2: `booking-reminder.ts` email template**

```ts
// lib/email/booking-reminder.ts
import "server-only";
import type { EventRow } from "@/lib/supabase/types";
import { fmtDay } from "@/lib/format";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function buildBookingReminderHtml(event: EventRow, manageUrl: string): string {
  const f = fmtDay(event.start_datetime.slice(0, 10));
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAFAF8;padding:40px 0;">
  <tr>
    <td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">
        <tr>
          <td style="font-family:Georgia,'Times New Roman',serif;font-weight:bold;font-size:15px;letter-spacing:0.02em;color:#111111;padding-bottom:32px;">
            SOUTH WEST KIDS CYCLING
          </td>
        </tr>
        <tr>
          <td style="font-family:-apple-system,Helvetica,Arial,sans-serif;font-size:11px;font-weight:bold;letter-spacing:0.1em;color:#E0102A;padding-bottom:14px;">
            TOMORROW
          </td>
        </tr>
        <tr>
          <td style="font-family:Georgia,'Times New Roman',serif;font-weight:bold;font-size:26px;line-height:1.2;color:#111111;padding-bottom:12px;">
            ${escapeHtml(event.title)}
          </td>
        </tr>
        <tr>
          <td style="font-family:-apple-system,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:#4A4A46;padding-bottom:20px;">
            ${f.day} ${f.mon} &middot; ${escapeHtml(event.venue_name)}
          </td>
        </tr>
        <tr>
          <td>
            <a href="${escapeHtml(manageUrl)}" style="display:inline-block;background:#111111;color:#FAFAF8;font-family:-apple-system,Helvetica,Arial,sans-serif;font-weight:bold;font-size:14px;text-decoration:none;padding:13px 26px;">
              View your booking
            </a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
`;
}
```

- [ ] **Step 3: The cron route**

```ts
// app/api/cron/booking-reminders/route.ts
import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/resend";
import { buildBookingReminderHtml } from "@/lib/email/booking-reminder";
import { ukMidnightUtcIso, ukTomorrowDateIso } from "@/lib/uk-time";
import type { EventRow } from "@/lib/supabase/types";

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const tomorrow = ukTomorrowDateIso();
  const dayAfter = new Date(`${tomorrow}T00:00:00.000Z`);
  dayAfter.setUTCDate(dayAfter.getUTCDate() + 1);

  const { data: events, error: eventsError } = await supabase
    .from("events")
    .select("*")
    .eq("bookable", true)
    .gte("start_datetime", ukMidnightUtcIso(tomorrow))
    .lt("start_datetime", dayAfter.toISOString());
  if (eventsError) return NextResponse.json({ error: eventsError.message }, { status: 500 });

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.southwestkidscycling.uk";
  let sent = 0;

  for (const event of events as EventRow[]) {
    const { data: bookings, error: bookingsError } = await supabase
      .from("bookings")
      .select("attendee:attendees(email)")
      .eq("event_id", event.id)
      .eq("status", "confirmed");
    if (bookingsError) continue;

    const emails = [...new Set((bookings as unknown as { attendee: { email: string } }[]).map((b) => b.attendee.email))];
    for (const email of emails) {
      const { data: linkData } = await supabase.auth.admin.generateLink({
        type: "magiclink",
        email,
        options: { redirectTo: `${siteUrl}/auth/confirm?next=/my-events` },
      });
      try {
        await sendEmail({
          to: email,
          subject: `Tomorrow: ${event.title}`,
          html: buildBookingReminderHtml(event, linkData?.properties?.action_link ?? `${siteUrl}/my-events/login`),
        });
        sent++;
      } catch {
        // Best-effort per recipient, same pattern as the other cron routes.
      }
    }
  }

  return NextResponse.json({ sent, events: events.length });
}
```

- [ ] **Step 4: Add the cron entry and manually verify**

In `vercel.json`, add to the `crons` array (after the existing four):

```json
    {
      "path": "/api/cron/booking-reminders",
      "schedule": "0 18 * * *"
    }
```

Manually verify locally: start the dev server, then with a bookable test event dated for tomorrow and one confirmed booking on it:

```bash
curl -i http://localhost:3000/api/cron/booking-reminders -H "Authorization: Bearer $CRON_SECRET"
```

Expected: `200` with `{"sent":1,"events":1}` (or matching your test data), and the confirmed attendee receives the reminder email. Also verify the auth guard:

```bash
curl -i http://localhost:3000/api/cron/booking-reminders
```

Expected: `401 {"error":"Unauthorized"}`.

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add lib/email/booking-reminder.ts app/api/cron/booking-reminders/route.ts lib/uk-time.ts vercel.json
git commit -m "$(cat <<'EOF'
Add day-before booking reminder cron

Finds bookable events happening tomorrow (UK time) and emails every
confirmed attendee once, following the same CRON_SECRET-gated,
per-recipient-best-effort pattern as the existing pending-digest and
monthly-digest cron routes.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## After Task 9

Update `README.md`'s "Cron jobs" table (new row for `booking-reminders`) and "Project structure" section (new `app/my-events/`, `app/events/[id]/page.tsx`, booking-related `lib/actions/`/`lib/email/` files) per the `readme-continuous-updates` habit already established for this project — this isn't a separate task since it's a documentation-only follow-up with no test cycle of its own.
