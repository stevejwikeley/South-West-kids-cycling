# Members Centre, Plan 1: Riders, Club Groups, and Booking with Saved Children

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Parents save their children once (name, DOB, emergency contact, medical notes) and book them into sessions with a tick box. Clubs define priced groups and assign children to them. Coaches see a roster with each child's group and emergency details. Still free-only: payment arrives in Plan 2.

**Architecture:** Four new tables (`riders`, `club_staff`, `club_groups`, `rider_club_groups`) plus `rider_id`/`group_id` on `booking_people` and `bookable`/`booking_capacity` on `event_series`. `create_booking()` is replaced so it carries those two new columns through. Pure decision logic (age category from DOB, group resolution, money parsing, form parsing) lives in plain `lib/` modules with Vitest unit tests (the repo's first unit-test runner). Everything that touches Supabase follows the existing Server Action + RLS conventions in `lib/actions/bookings.ts`.

**Tech Stack:** Next.js 16 App Router / Server Actions, Supabase (Postgres + Auth + RLS), Resend, Vitest (new, dev-only).

**Spec:** [docs/superpowers/specs/2026-10-03-members-centre-paid-sessions-design.md](../specs/2026-10-03-members-centre-paid-sessions-design.md)

## Global Constraints

- Work in a **git worktree** branched from local `main` (another Claude session is often active in this repo). Run `npm ci` inside it; Turbopack rejects a symlinked `node_modules`.
- Next migration number is **`0027`** (`main` has `0022`–`0026`). Migrations are applied **by hand** in the Supabase SQL editor; `lib/supabase/types.ts` is updated **by hand** to match.
- Read `node_modules/next/dist/docs/` before using any Next API you haven't seen in this repo (AGENTS.md). Don't introduce APIs that aren't already used here without checking.
- Follow existing idioms exactly: manual `String(formData.get(...))` parsing (no zod in forms), inline `style={{...}}` objects with the existing palette (`#111111` ink, `#FAFAF8` paper, `#F3F2EE` panel, `#E4E2DD`/`#D8D6D0` rules, `#6B6B66` muted, `#E0102A` accent, `#A13A2A` error), `className="mono"` / `"disp"` for type.
- Capacity is counted **per person**, never per booking. A booking's people are never split between statuses. `booking_capacity = null` means unlimited.
- Email is **best-effort**: a send failure never rolls back or blocks a DB write.
- `riders.medical_notes` and emergency contacts are children's special-category data: never log them, never send them to Claude, never show them to anyone but the parent, admins, and staff of a club the child has booked with.
- **Paid** sessions are out of scope here. Don't add price-taking UI. `club_groups.price_pence` is stored and shown to staff only.
- Pure modules under `lib/` that get unit tests must **not** import `server-only`, Supabase, or anything Next-specific.
- `discipline` and `kind` are independent axes. Never infer one from the other.
- Keep `README.md` current as each task lands (project convention), not just at the end.

---

### Task 1: Vitest, age category, and money helpers

**Files:**
- Modify: `package.json` (add `vitest` devDependency and `"test": "vitest run"` script)
- Create: `vitest.config.mts`
- Create: `lib/riders/age-category.ts`
- Create: `lib/riders/age-category.test.ts`
- Create: `lib/money.ts`
- Create: `lib/money.test.ts`

**Interfaces:**
- Produces:
  - `ageCategoryOn(dateOfBirth: string, onDate: string): AgeCategory` (both `YYYY-MM-DD`)
  - `riderAgeCategory(rider: { date_of_birth: string | null; age_category: AgeCategory | null }, onDate: string): AgeCategory`
  - `poundsToPence(input: string): number | null`
  - `formatPence(pence: number): string`  (e.g. `350` → `"£3.50"`)

- [ ] **Step 1: Install Vitest and add config**

```bash
npm install -D vitest
```

Add to `package.json` `"scripts"`: `"test": "vitest run"`.

```ts
// vitest.config.mts
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Unit tests cover pure lib/ modules only (no Supabase, no Next runtime);
// e2e/ stays Playwright. The regex alias mirrors tsconfig's "@/*": ["./*"].
export default defineConfig({
  resolve: {
    alias: [{ find: /^@\//, replacement: fileURLToPath(new URL("./", import.meta.url)) }],
  },
  test: {
    include: ["lib/**/*.test.ts"],
    environment: "node",
  },
});
```

- [ ] **Step 2: Write the failing tests**

```ts
// lib/riders/age-category.test.ts
import { describe, expect, it } from "vitest";
import { ageCategoryOn, riderAgeCategory } from "./age-category";

describe("ageCategoryOn", () => {
  // British Cycling youth categories use age on 31 December of the
  // competition year, so only the two years matter.
  it("puts a rider who turns 7 this year in U8", () => {
    expect(ageCategoryOn("2019-12-31", "2026-01-15")).toBe("u8");
  });
  it("puts a rider who turns 8 this year in U10, even before their birthday", () => {
    expect(ageCategoryOn("2018-11-30", "2026-03-01")).toBe("u10");
  });
  it("maps 10-11 to U12 and 12-13 to U14", () => {
    expect(ageCategoryOn("2016-06-01", "2026-10-03")).toBe("u12");
    expect(ageCategoryOn("2013-06-01", "2026-10-03")).toBe("u14");
  });
  it("maps 14 and over to U16 (the enum's top category)", () => {
    expect(ageCategoryOn("2012-01-01", "2026-10-03")).toBe("u16");
    expect(ageCategoryOn("2008-01-01", "2026-10-03")).toBe("u16");
  });
});

describe("riderAgeCategory", () => {
  it("derives from date of birth when present", () => {
    expect(riderAgeCategory({ date_of_birth: "2018-05-01", age_category: "u8" }, "2026-10-03")).toBe("u10");
  });
  it("falls back to the stored category for guest-created riders", () => {
    expect(riderAgeCategory({ date_of_birth: null, age_category: "u12" }, "2026-10-03")).toBe("u12");
  });
  it("throws when neither is present (the DB check constraint forbids this)", () => {
    expect(() => riderAgeCategory({ date_of_birth: null, age_category: null }, "2026-10-03")).toThrow();
  });
});
```

```ts
// lib/money.test.ts
import { describe, expect, it } from "vitest";
import { formatPence, poundsToPence } from "./money";

describe("poundsToPence", () => {
  it.each([
    ["3.50", 350],
    ["3.5", 350],
    ["6", 600],
    ["£6.00", 600],
    [" 0 ", 0],
  ])("parses %s as %i pence", (input, expected) => {
    expect(poundsToPence(input)).toBe(expected);
  });
  it.each(["", "abc", "-1", "6.005", "1e3"])("rejects %s", (input) => {
    expect(poundsToPence(input)).toBeNull();
  });
});

describe("formatPence", () => {
  it("formats pounds with two decimals", () => {
    expect(formatPence(350)).toBe("£3.50");
    expect(formatPence(600)).toBe("£6.00");
    expect(formatPence(0)).toBe("£0.00");
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL, "Failed to resolve import ./age-category" and "./money".

- [ ] **Step 4: Implement**

```ts
// lib/riders/age-category.ts
import type { AgeCategory } from "@/lib/supabase/types";

// British Cycling youth categories are fixed for the whole calendar year by
// the rider's age on 31 December — so it's just the difference in years,
// no birthday arithmetic. 14+ clamps to u16 because that's the top of the
// existing age_category enum (0001_init.sql).
export function ageCategoryOn(dateOfBirth: string, onDate: string): AgeCategory {
  const age = Number(onDate.slice(0, 4)) - Number(dateOfBirth.slice(0, 4));
  if (age < 8) return "u8";
  if (age < 10) return "u10";
  if (age < 12) return "u12";
  if (age < 14) return "u14";
  return "u16";
}

export function riderAgeCategory(
  rider: { date_of_birth: string | null; age_category: AgeCategory | null },
  onDate: string
): AgeCategory {
  if (rider.date_of_birth) return ageCategoryOn(rider.date_of_birth, onDate);
  if (rider.age_category) return rider.age_category;
  throw new Error("Rider has neither a date of birth nor an age category.");
}
```

```ts
// lib/money.ts
// All money is stored as integer pence. These are the only two places
// pounds-as-text and pence-as-number convert into each other.
export function poundsToPence(input: string): number | null {
  const cleaned = input.trim().replace(/^£/, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, frac = ""] = cleaned.split(".");
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}

export function formatPence(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (all tests in both files).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.mts lib/riders lib/money.ts lib/money.test.ts
git commit -m "Add Vitest with age-category and money helpers for the members centre"
```

---

### Task 2: Schema: riders, club staff, club groups, and series signup

**Files:**
- Create: `supabase/migrations/0027_members_centre.sql`
- Create: `supabase/migrations/0027_members_centre.verify.sql`
- Modify: `supabase/migrations/README.md` (add the 0027 row to the table)
- Modify: `lib/supabase/types.ts`

**Interfaces:**
- Produces (TypeScript, in `lib/supabase/types.ts`):
  - `RiderRow { id; attendee_id; name; date_of_birth: string | null; age_category: AgeCategory | null; medical_notes: string | null; emergency_contact_name: string | null; emergency_contact_phone: string | null; photo_consent: boolean; archived_at: string | null; created_at; updated_at }`
  - `ClubStaffRow { club_id; profile_id; created_at }`
  - `ClubGroupRow { id; club_id; name; description: string | null; price_pence: number; sort_order: number; active: boolean; created_at; updated_at }`
  - `RiderClubGroupRow { rider_id; club_id; group_id; assigned_by: string | null; assigned_at }`
  - `BookingPersonRow` gains `rider_id: string | null; group_id: string | null`
  - `EventSeriesRow` gains `bookable: boolean; booking_capacity: number | null`
  - `Database.public.Functions.is_club_staff: { Args: { p_club_id: string }; Returns: boolean }`
  - `create_booking` `p_people` element type gains optional `rider_id?: string | null; group_id?: string | null`
- Produces (SQL): `is_club_staff(uuid) returns boolean` (true for admins), `create_booking()` accepting `rider_id`/`group_id` per person.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0027_members_centre.sql
-- Members centre, part 1 (docs/superpowers/specs/2026-10-03-members-centre-paid-sessions-design.md).
-- Parents save their children once (riders) instead of retyping names on
-- every booking; clubs define groups with a per-child price (Mid Devon:
-- Group 1/2 £3.50, Group 3 £6.00) and coaches put each child in one.
-- Prices are stored now but nothing charges them until the Stripe
-- migrations that follow.
--
-- club_staff is new because organisers have never been tied to a club —
-- events are created_by-scoped — and a coach needs to see riders for
-- every session their club runs, not just the ones they personally created.

-- ---------- club_staff ----------
create table club_staff (
  club_id uuid not null references clubs (id) on delete cascade,
  profile_id uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (club_id, profile_id)
);

create index club_staff_profile_id_idx on club_staff (profile_id);

alter table club_staff enable row level security;

create policy "staff can read club staff"
  on club_staff for select using (is_staff());
create policy "admins can add club staff"
  on club_staff for insert with check (is_admin());
create policy "admins can remove club staff"
  on club_staff for delete using (is_admin());

-- True for admins (who can manage every club) and for anyone listed in
-- club_staff for this club. security definer for the same reason as
-- is_admin(): policies on other tables call it, and it must be able to
-- read club_staff regardless of the caller's own RLS view of it.
create function is_club_staff(p_club_id uuid) returns boolean as $$
  select is_admin() or exists (
    select 1 from public.club_staff where club_id = p_club_id and profile_id = auth.uid()
  );
$$ language sql stable security definer set search_path = public;

grant execute on function is_club_staff(uuid) to authenticated;

-- ---------- club_groups ----------
create table club_groups (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs (id) on delete cascade,
  name text not null,
  description text,
  price_pence integer not null check (price_pence >= 0),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index club_groups_club_id_idx on club_groups (club_id);

create trigger club_groups_set_updated_at before update on club_groups
  for each row execute function set_updated_at();

alter table club_groups enable row level security;

create policy "public can read active club groups"
  on club_groups for select using (active or is_club_staff(club_id));
create policy "club staff can insert groups"
  on club_groups for insert with check (is_club_staff(club_id));
create policy "club staff can update groups"
  on club_groups for update using (is_club_staff(club_id)) with check (is_club_staff(club_id));
-- No delete policy: groups are deactivated, never deleted, because
-- booking_people.group_id keeps pointing at them for history.

-- ---------- riders ----------
create table riders (
  id uuid primary key default gen_random_uuid(),
  attendee_id uuid not null references attendees (id) on delete cascade,
  name text not null,
  date_of_birth date,
  age_category age_category,
  medical_notes text,
  emergency_contact_name text,
  emergency_contact_phone text,
  photo_consent boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Guest checkout only knows an age category; the members-centre form
  -- always asks for a DOB. One of the two must exist to book.
  constraint rider_has_age check (date_of_birth is not null or age_category is not null)
);

create index riders_attendee_id_idx on riders (attendee_id);

create trigger riders_set_updated_at before update on riders
  for each row execute function set_updated_at();

alter table riders enable row level security;

create policy "parents can read their own riders"
  on riders for select using (auth.uid() = attendee_id);
create policy "parents can add their own riders"
  on riders for insert with check (auth.uid() = attendee_id);
create policy "parents can update their own riders"
  on riders for update using (auth.uid() = attendee_id) with check (auth.uid() = attendee_id);
create policy "admins can read all riders"
  on riders for select using (is_admin());

-- ---------- rider_club_groups ----------
-- Which group a child is in at a given club. assigned_by is the coach's
-- profile id; null means the parent picked it (allowed only until a coach
-- has set one — enforced in the Server Actions, which write via the
-- service-role client, so there are deliberately no write policies here).
create table rider_club_groups (
  rider_id uuid not null references riders (id) on delete cascade,
  club_id uuid not null references clubs (id) on delete cascade,
  group_id uuid not null references club_groups (id),
  assigned_by uuid references profiles (id) on delete set null,
  assigned_at timestamptz not null default now(),
  primary key (rider_id, club_id)
);

alter table rider_club_groups enable row level security;

create policy "parents can read their riders' groups"
  on rider_club_groups for select
  using (exists (select 1 from riders where riders.id = rider_club_groups.rider_id and riders.attendee_id = auth.uid()));
create policy "club staff can read their club's assignments"
  on rider_club_groups for select using (is_club_staff(club_id));

-- ---------- booking_people: link to rider and group ----------
alter table booking_people add column rider_id uuid references riders (id) on delete set null;
alter table booking_people add column group_id uuid references club_groups (id);

create index booking_people_rider_id_idx on booking_people (rider_id);

-- ---------- club staff can see their club's bookings ----------
-- Parallel to the existing "organisers can read … for their own events"
-- policies in 0018, keyed on the event's club instead of created_by.
create policy "club staff can read bookings for their club's events"
  on bookings for select
  using (exists (select 1 from events where events.id = bookings.event_id and events.club_id is not null and is_club_staff(events.club_id)));

create policy "club staff can read booking people for their club's events"
  on booking_people for select
  using (exists (
    select 1 from bookings join events on events.id = bookings.event_id
    where bookings.id = booking_people.booking_id and events.club_id is not null and is_club_staff(events.club_id)
  ));

create policy "club staff can read attendees who booked their club's events"
  on attendees for select
  using (exists (
    select 1 from bookings join events on events.id = bookings.event_id
    where bookings.attendee_id = attendees.id and events.club_id is not null and is_club_staff(events.club_id)
  ));

create policy "club staff can read riders booked on their club's events"
  on riders for select
  using (exists (
    select 1 from booking_people bp
    join bookings b on b.id = bp.booking_id
    join events e on e.id = b.event_id
    where bp.rider_id = riders.id and e.club_id is not null and is_club_staff(e.club_id)
  ));

-- ---------- event_series: signups set once for a whole programme ----------
alter table event_series add column bookable boolean not null default false;
alter table event_series add column booking_capacity integer;
alter table event_series add constraint series_booking_capacity_positive
  check (booking_capacity is null or booking_capacity > 0);

-- ---------- create_booking(): carry rider_id/group_id through ----------
-- Identical to 0018's version apart from the booking_people insert. The
-- two new keys are optional in p_people so the guest-checkout path, which
-- has no rider ids until after it saves them, keeps working unchanged.
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

  insert into booking_people (booking_id, name, age_category, rider_id, group_id)
  select v_booking_id, p->>'name', (p->>'age_category')::age_category,
         nullif(p->>'rider_id', '')::uuid, nullif(p->>'group_id', '')::uuid
  from jsonb_array_elements(p_people) as p;

  return query select v_booking_id, v_status::text;
end;
$$ language plpgsql set search_path = public;

revoke execute on function create_booking(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function create_booking(uuid, uuid, jsonb) to service_role;
```

- [ ] **Step 2: Write the verification script**

```sql
-- supabase/migrations/0027_members_centre.verify.sql
-- Throwaway check, NOT a migration (same convention as
-- 0018_event_booking.verify.sql). Paste into the SQL editor after applying
-- 0027. Creates scratch rows, asserts, and deletes everything it made.
do $$
declare
  v_attendee uuid := gen_random_uuid();
  v_club uuid;
  v_group uuid;
  v_rider uuid;
  v_event uuid;
  v_booking uuid;
  v_status text;
  v_rider_on_person uuid;
  v_group_on_person uuid;
  v_caught boolean := false;
begin
  insert into auth.users (id, email, raw_user_meta_data) values (v_attendee, 'scratch-0027@example.com', '{"role":"attendee"}'::jsonb);
  insert into clubs (name, location) values ('SCRATCH CLUB 0027', 'Nowhere') returning id into v_club;
  insert into club_groups (club_id, name, price_pence) values (v_club, 'Group 1', 350) returning id into v_group;
  insert into riders (attendee_id, name, date_of_birth) values (v_attendee, 'Kid', '2017-04-01') returning id into v_rider;

  begin
    insert into riders (attendee_id, name) values (v_attendee, 'No age');
  exception when check_violation then v_caught := true;
  end;
  assert v_caught, 'rider_has_age should reject a rider with neither DOB nor category';

  insert into events (title, discipline, kind, club_id, start_datetime, venue_name, organiser_url, region, approved, bookable, booking_capacity)
  values ('SCRATCH 0027', 'road', 'training', v_club, now() + interval '7 days', 'Test', 'https://example.com', 'devon', true, true, 10)
  returning id into v_event;

  select booking_id, status into v_booking, v_status
    from create_booking(v_event, v_attendee, jsonb_build_array(jsonb_build_object(
      'name', 'Kid', 'age_category', 'u10', 'rider_id', v_rider, 'group_id', v_group)));
  assert v_status = 'confirmed', 'booking should confirm';

  select rider_id, group_id into v_rider_on_person, v_group_on_person from booking_people where booking_id = v_booking;
  assert v_rider_on_person = v_rider and v_group_on_person = v_group, 'rider_id/group_id should be carried through';

  -- Old-shape payload (guest checkout) still works.
  select status into v_status from create_booking(v_event, v_attendee, '[{"name":"Guest kid","age_category":"u8"}]'::jsonb);
  assert v_status = 'confirmed', 'payload without rider_id/group_id should still book';

  -- No session in the SQL editor, so auth.uid() is null: not staff.
  assert not is_club_staff(v_club), 'anonymous caller must not be club staff';

  delete from events where id = v_event;
  delete from clubs where id = v_club;
  delete from auth.users where id = v_attendee;
  raise notice '0027 verification passed';
end $$;
```

- [ ] **Step 3: Update `lib/supabase/types.ts`**

Add after `BookingPersonRow`:

```ts
export interface RiderRow {
  id: string;
  attendee_id: string;
  name: string;
  date_of_birth: string | null;
  age_category: AgeCategory | null;
  medical_notes: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  photo_consent: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClubStaffRow {
  club_id: string;
  profile_id: string;
  created_at: string;
}

export interface ClubGroupRow {
  id: string;
  club_id: string;
  name: string;
  description: string | null;
  price_pence: number;
  sort_order: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

// assigned_by null = the parent chose it; a profile id = a coach set it,
// after which the parent can no longer change it.
export interface RiderClubGroupRow {
  rider_id: string;
  club_id: string;
  group_id: string;
  assigned_by: string | null;
  assigned_at: string;
}
```

Add `rider_id: string | null;` and `group_id: string | null;` to `BookingPersonRow`. Add `bookable: boolean;` and `booking_capacity: number | null;` to `EventSeriesRow`.

In `Database.public.Tables`, add:

```ts
      riders: { Row: AsRecord<RiderRow>; Insert: AsRecord<Partial<RiderRow>>; Update: AsRecord<Partial<RiderRow>>; Relationships: [] };
      club_staff: { Row: AsRecord<ClubStaffRow>; Insert: AsRecord<Partial<ClubStaffRow>>; Update: AsRecord<Partial<ClubStaffRow>>; Relationships: [] };
      club_groups: { Row: AsRecord<ClubGroupRow>; Insert: AsRecord<Partial<ClubGroupRow>>; Update: AsRecord<Partial<ClubGroupRow>>; Relationships: [] };
      rider_club_groups: { Row: AsRecord<RiderClubGroupRow>; Insert: AsRecord<Partial<RiderClubGroupRow>>; Update: AsRecord<Partial<RiderClubGroupRow>>; Relationships: [] };
```

Change `create_booking`'s `p_people` type and add `is_club_staff`:

```ts
      create_booking: {
        Args: {
          p_event_id: string;
          p_attendee_id: string;
          p_people: { name: string; age_category: AgeCategory; rider_id?: string | null; group_id?: string | null }[];
        };
        Returns: { booking_id: string; status: string }[];
      };
      is_club_staff: {
        Args: { p_club_id: string };
        Returns: boolean;
      };
```

- [ ] **Step 4: Add the README row**

In `supabase/migrations/README.md`'s table, append:

```
| `0027_members_centre.sql` | Members centre, part 1: `riders` (a parent's saved children, DOB or age category required), `club_staff` + `is_club_staff()` (who coaches at a club; true for admins), `club_groups` (per-club groups with a per-child `price_pence`, deactivated rather than deleted), `rider_club_groups` (a child's group at a club; `assigned_by` null = parent-chosen). Adds `rider_id`/`group_id` to `booking_people`, `bookable`/`booking_capacity` to `event_series`, club-staff read policies on bookings/booking_people/attendees/riders, and replaces `create_booking()` to carry the two new columns (old payload shape still accepted). |
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. (`SignupForm`/`createBooking` still pass `{name, age_category}`, which the optional keys allow.)

- [ ] **Step 6: Apply and verify (manual, needs the user)**

Ask the user to paste `0027_members_centre.sql` into the Supabase SQL editor and run it, then run `0027_members_centre.verify.sql`.
Expected: `NOTICE: 0027 verification passed`.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0027_members_centre.sql supabase/migrations/0027_members_centre.verify.sql supabase/migrations/README.md lib/supabase/types.ts
git commit -m "Add riders, club staff and club groups schema for the members centre"
```

---

### Task 3: One "Take signups on this site" section, on events and series

The existing "Free event with signup on this site" box becomes a shared component used by both the one-off and recurring forms. Plan 2 adds the Free/Paid choice *inside* this component. Don't build a separate control.

**Files:**
- Create: `components/events/SignupSettings.tsx`
- Modify: `components/events/EventForm.tsx:350-361` (replace the inline signup box)
- Modify: `components/events/SeriesForm.tsx` (render `SignupSettings` after `ClubSelect`)
- Modify: `lib/actions/parse-series-form.ts` (`EventSeriesFormValues`, `parseSeriesForm`, both prefill functions)
- Create: `lib/actions/parse-signup-fields.ts`
- Create: `lib/actions/parse-signup-fields.test.ts`
- Modify: `lib/actions/parse-event-form.ts:70-75` (use the shared parser)
- Modify: `lib/series-rows.ts` (copy `bookable`/`booking_capacity` in all four row builders)
- Create: `lib/series-booking-guard.ts`
- Modify: `lib/actions/event-series.ts` (`updateExistingSeries`, `deleteSeries`)

**Interfaces:**
- Produces:
  - `<SignupSettings bookable={boolean} capacity={number | null} />`, a client component posting `bookable` (checkbox "on") and `booking_capacity` (number). Plan 2 adds props to it.
  - `parseSignupFields(formData: FormData): { ok: false; error: string } | { ok: true; values: { bookable: boolean; booking_capacity: number | null } }`
  - `EventSeriesFormValues` gains `"bookable" | "booking_capacity"`.
  - `activeBookingCountForEvents(eventIds: string[]): Promise<number>` in `lib/series-booking-guard.ts` (server-only).

- [ ] **Step 1: Write the failing parser test**

```ts
// lib/actions/parse-signup-fields.test.ts
import { describe, expect, it } from "vitest";
import { parseSignupFields } from "./parse-signup-fields";

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

describe("parseSignupFields", () => {
  it("is off when the checkbox is absent", () => {
    expect(parseSignupFields(fd({}))).toEqual({ ok: true, values: { bookable: false, booking_capacity: null } });
  });
  it("treats a blank space limit as unlimited", () => {
    expect(parseSignupFields(fd({ bookable: "on", booking_capacity: "" }))).toEqual({
      ok: true,
      values: { bookable: true, booking_capacity: null },
    });
  });
  it("parses a whole-number limit", () => {
    expect(parseSignupFields(fd({ bookable: "on", booking_capacity: "24" }))).toEqual({
      ok: true,
      values: { bookable: true, booking_capacity: 24 },
    });
  });
  it.each(["0", "-3", "2.5", "abc"])("rejects a limit of %s", (cap) => {
    expect(parseSignupFields(fd({ bookable: "on", booking_capacity: cap })).ok).toBe(false);
  });
  it("ignores a stale limit when signups are off", () => {
    expect(parseSignupFields(fd({ booking_capacity: "abc" }))).toEqual({ ok: true, values: { bookable: false, booking_capacity: null } });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- parse-signup-fields`
Expected: FAIL, cannot resolve `./parse-signup-fields`.

- [ ] **Step 3: Implement the parser and use it in `parse-event-form.ts`**

```ts
// lib/actions/parse-signup-fields.ts
// The "Take signups on this site" section is shared by the event and series
// forms (components/events/SignupSettings.tsx), so its parsing is too.
export function parseSignupFields(
  formData: FormData
): { ok: false; error: string } | { ok: true; values: { bookable: boolean; booking_capacity: number | null } } {
  const bookable = formData.get("bookable") === "on";
  if (!bookable) return { ok: true, values: { bookable: false, booking_capacity: null } };

  const raw = String(formData.get("booking_capacity") ?? "").trim();
  if (!raw) return { ok: true, values: { bookable: true, booking_capacity: null } };

  const capacity = Number(raw);
  if (!Number.isInteger(capacity) || capacity <= 0) {
    return { ok: false, error: "Space limit must be a whole number greater than zero, or left blank for unlimited." };
  }
  return { ok: true, values: { bookable: true, booking_capacity: capacity } };
}
```

In `lib/actions/parse-event-form.ts`, replace lines 70–75 (the `bookable` / `bookingCapacityRaw` / `bookingCapacity` block and its error) with:

```ts
  const signup = parseSignupFields(formData);
  if (!signup.ok) return signup;
```

Replace `bookable,` / `booking_capacity: bookingCapacity,` in the returned values with `...signup.values,` and add `import { parseSignupFields } from "./parse-signup-fields";`.

- [ ] **Step 4: Run tests**

Run: `npm test && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 5: Create `SignupSettings` and use it in `EventForm`**

```tsx
// components/events/SignupSettings.tsx
"use client";

import { useState } from "react";

const label: React.CSSProperties = { fontSize: 10.5, color: "#6B6B66", display: "block", marginBottom: 6, letterSpacing: "0.03em" };
const input: React.CSSProperties = { width: "100%", background: "#FFFFFF", border: "1px solid #D8D6D0", color: "#111111", padding: "9px 11px", fontSize: 13.5 };

// The single place an organiser turns on native signups — for one-off
// events (EventForm) and whole recurring programmes (SeriesForm) alike.
// Paid sessions (members-centre Plan 2) extend this component with a
// Free/Paid choice rather than adding a separate toggle.
export default function SignupSettings({ bookable: initialBookable, capacity }: { bookable: boolean; capacity: number | null }) {
  const [bookable, setBookable] = useState(initialBookable);

  return (
    <div style={{ background: "#F3F2EE", border: "1px solid #E4E2DD", padding: "16px 18px", marginBottom: 20 }}>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: bookable ? 14 : 0 }}>
        <input type="checkbox" name="bookable" checked={bookable} onChange={(e) => setBookable(e.target.checked)} />
        Take signups on this site
      </label>
      {bookable && (
        <div>
          <label className="mono" style={label}>SPACE LIMIT (OPTIONAL — BLANK = UNLIMITED)</label>
          <input style={{ ...input, maxWidth: 140 }} type="number" min={1} step={1} name="booking_capacity" defaultValue={capacity ?? ""} />
        </div>
      )}
    </div>
  );
}
```

In `components/events/EventForm.tsx`, replace the whole `<div style={{ background: "#F3F2EE" ... }}>` signup block (currently lines ~350–361) with:

```tsx
      <SignupSettings bookable={event?.bookable ?? false} capacity={event?.booking_capacity ?? null} />
```

Remove the now-unused `const [bookable, setBookable] = useState(...)` (line ~54) and add `import SignupSettings from "./SignupSettings";`.

- [ ] **Step 6: Add signup fields to series**

In `lib/actions/parse-series-form.ts`:
- add `| "bookable"` and `| "booking_capacity"` to the `EventSeriesFormValues` `Pick<...>` list;
- in `eventRowToSeriesPrefill` add `bookable: event.bookable, booking_capacity: event.booking_capacity,`;
- in `pendingRowToSeriesPrefill` add `bookable: (field("bookable") as boolean) ?? false, booking_capacity: (field("booking_capacity") as number | null) ?? null,`;
- in `parseSeriesForm`, before the `return { ok: true, ...}`, add

```ts
  const signup = parseSignupFields(formData);
  if (!signup.ok) return signup;
```

  and add `...signup.values,` to the returned `values`. Import `parseSignupFields` from `./parse-signup-fields`.

In `lib/series-rows.ts`, add `bookable: values.bookable, booking_capacity: values.booking_capacity,` to `occurrenceInsertRow`, `seriesInsertRow`, `seriesUpdateRow`, and `eventsPropagateUpdateRow`. Occurrences inherit signup settings exactly like every other template field, and detached occurrences keep their own.

In `components/events/SeriesForm.tsx`, directly after `<ClubSelect ... />` (line ~292):

```tsx
      <SignupSettings bookable={base?.bookable ?? false} capacity={base?.booking_capacity ?? null} />
```

with `import SignupSettings from "./SignupSettings";`. (`base` is the series-or-prefill object the form already reads `club_id`/`description` from.)

- [ ] **Step 7: Guard series edits/deletes against wiping bookings**

`bookings.event_id` is `on delete cascade`. Now that series occurrences can be bookable, shortening a series or deleting it would silently delete families' bookings. Refuse instead.

```ts
// lib/series-booking-guard.ts
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// Service-role read: the caller has already been authorised to edit this
// series, and an organiser's own RLS view of bookings is scoped by
// created_by/club, which isn't guaranteed to cover every occurrence.
export async function activeBookingCountForEvents(eventIds: string[]): Promise<number> {
  if (eventIds.length === 0) return 0;
  const admin = createAdminClient();
  const { count, error } = await admin
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .in("event_id", eventIds)
    .neq("status", "cancelled");
  if (error) throw error;
  return count ?? 0;
}
```

In `updateExistingSeries` (`lib/actions/event-series.ts`), immediately **before** the `if (toDeleteDates.length > 0) {` block:

```ts
  const deletingIds = attached.filter((r) => toDeleteDates.includes(r.occurrence_date!)).map((r) => r.id);
  if ((await activeBookingCountForEvents(deletingIds)) > 0) {
    return { error: "Some of the dates this change removes already have bookings. Cancel those bookings first, or keep those dates." };
  }
```

In `deleteSeries`, before the delete runs (after its existing auth check), load the series' event ids and refuse the same way:

```ts
  const { data: occurrenceRows } = await supabase.from("events").select("id").eq("series_id", id);
  if ((await activeBookingCountForEvents((occurrenceRows ?? []).map((r) => r.id))) > 0) {
    return { error: "This series has sessions with bookings. Cancel those bookings before deleting it." };
  }
```

Import `activeBookingCountForEvents` from `@/lib/series-booking-guard`.

- [ ] **Step 8: Verify**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: all clean.

Manual (preview, see README "Preview environment"): create a test series with "Take signups on this site" ticked and a limit of 5. Every generated occurrence's detail page shows the signup form. Book one occurrence, then edit the series so that date is removed. Expected: the error above, and the booking still exists. Delete the test booking and series afterwards.

- [ ] **Step 9: Commit**

```bash
git add components/events/SignupSettings.tsx components/events/EventForm.tsx components/events/SeriesForm.tsx lib/actions/parse-signup-fields.ts lib/actions/parse-signup-fields.test.ts lib/actions/parse-event-form.ts lib/actions/parse-series-form.ts lib/series-rows.ts lib/series-booking-guard.ts lib/actions/event-series.ts
git commit -m "Share one signup section across events and recurring series"
```

---

### Task 4: Members centre: saved children

**Files:**
- Create: `lib/actions/parse-rider-form.ts`
- Create: `lib/actions/parse-rider-form.test.ts`
- Create: `lib/actions/riders.ts`
- Modify: `lib/data.ts` (add `getMyRiders`, `getMyRider`)
- Create: `components/members/MembersNav.tsx`
- Create: `components/members/RiderForm.tsx`
- Create: `components/members/RidersList.tsx`
- Create: `app/my-events/(protected)/children/page.tsx`
- Create: `app/my-events/(protected)/children/new/page.tsx`
- Create: `app/my-events/(protected)/children/[id]/edit/page.tsx`
- Modify: `app/my-events/(protected)/page.tsx` (heading + `MembersNav`)

**Interfaces:**
- Consumes: `RiderRow` (Task 2), `getCurrentAttendee()` (`lib/auth.ts`).
- Produces:
  - `RiderFormValues = { name: string; date_of_birth: string; medical_notes: string | null; emergency_contact_name: string; emergency_contact_phone: string; photo_consent: boolean }`
  - `parseRiderForm(formData: FormData, today: string): { ok: false; error: string } | { ok: true; values: RiderFormValues }`
  - `saveRider(riderId: string | null, _prev: RiderFormState, formData: FormData): Promise<RiderFormState>` (redirects to `/my-events/children` on success)
  - `archiveRider(riderId: string): Promise<{ error?: string }>`
  - `getMyRiders(attendeeId: string): Promise<RiderRow[]>` (non-archived, by name)
  - `getMyRider(riderId: string): Promise<RiderRow | null>` (RLS-scoped)
  - `<MembersNav active="bookings" | "children" />` (Plan 2 adds `"cards"`)

- [ ] **Step 1: Write the failing parser test**

```ts
// lib/actions/parse-rider-form.test.ts
import { describe, expect, it } from "vitest";
import { parseRiderForm } from "./parse-rider-form";

const TODAY = "2026-10-03";

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

const valid = {
  name: " Ada Lovelace ",
  date_of_birth: "2017-04-01",
  emergency_contact_name: "Pat",
  emergency_contact_phone: "07700 900123",
};

describe("parseRiderForm", () => {
  it("accepts a complete form and trims text", () => {
    expect(parseRiderForm(fd({ ...valid, photo_consent: "on", medical_notes: " Asthma — has inhaler " }), TODAY)).toEqual({
      ok: true,
      values: {
        name: "Ada Lovelace",
        date_of_birth: "2017-04-01",
        medical_notes: "Asthma — has inhaler",
        emergency_contact_name: "Pat",
        emergency_contact_phone: "07700 900123",
        photo_consent: true,
      },
    });
  });
  it("stores blank medical notes as null and missing consent as false", () => {
    const r = parseRiderForm(fd(valid), TODAY);
    expect(r.ok && r.values.medical_notes).toBeNull();
    expect(r.ok && r.values.photo_consent).toBe(false);
  });
  it.each([
    ["name", "Your child's name is required."],
    ["date_of_birth", "Date of birth is required."],
    ["emergency_contact_name", "An emergency contact name is required."],
    ["emergency_contact_phone", "An emergency contact phone number is required."],
  ])("requires %s", (field, message) => {
    expect(parseRiderForm(fd({ ...valid, [field]: "" }), TODAY)).toEqual({ ok: false, error: message });
  });
  it("rejects a date of birth in the future", () => {
    expect(parseRiderForm(fd({ ...valid, date_of_birth: "2027-01-01" }), TODAY)).toEqual({
      ok: false,
      error: "Date of birth can't be in the future.",
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- parse-rider-form`
Expected: FAIL, cannot resolve `./parse-rider-form`.

- [ ] **Step 3: Implement the parser**

```ts
// lib/actions/parse-rider-form.ts
export interface RiderFormValues {
  name: string;
  date_of_birth: string;
  medical_notes: string | null;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  photo_consent: boolean;
}

// `today` is passed in (YYYY-MM-DD) rather than read from the clock so the
// future-DOB rule is testable.
export function parseRiderForm(
  formData: FormData,
  today: string
): { ok: false; error: string } | { ok: true; values: RiderFormValues } {
  const name = String(formData.get("name") ?? "").trim();
  const dateOfBirth = String(formData.get("date_of_birth") ?? "").trim();
  const medicalNotes = String(formData.get("medical_notes") ?? "").trim() || null;
  const emergencyName = String(formData.get("emergency_contact_name") ?? "").trim();
  const emergencyPhone = String(formData.get("emergency_contact_phone") ?? "").trim();
  const photoConsent = formData.get("photo_consent") === "on";

  if (!name) return { ok: false, error: "Your child's name is required." };
  if (!dateOfBirth) return { ok: false, error: "Date of birth is required." };
  if (dateOfBirth > today) return { ok: false, error: "Date of birth can't be in the future." };
  if (!emergencyName) return { ok: false, error: "An emergency contact name is required." };
  if (!emergencyPhone) return { ok: false, error: "An emergency contact phone number is required." };

  return {
    ok: true,
    values: {
      name,
      date_of_birth: dateOfBirth,
      medical_notes: medicalNotes,
      emergency_contact_name: emergencyName,
      emergency_contact_phone: emergencyPhone,
      photo_consent: photoConsent,
    },
  };
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- parse-rider-form`
Expected: PASS.

- [ ] **Step 5: Data helpers and actions**

Append to `lib/data.ts` (import `RiderRow` from `@/lib/supabase/types`):

```ts
export async function getMyRiders(attendeeId: string): Promise<RiderRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("riders")
    .select("*")
    .eq("attendee_id", attendeeId)
    .is("archived_at", null)
    .order("name", { ascending: true });
  if (error) throw error;
  return data as RiderRow[];
}

// RLS-scoped: returns null for another parent's rider rather than leaking it.
export async function getMyRider(riderId: string): Promise<RiderRow | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("riders").select("*").eq("id", riderId).is("archived_at", null).maybeSingle();
  return data as RiderRow | null;
}
```

```ts
// lib/actions/riders.ts
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAttendee } from "@/lib/auth";
import { parseRiderForm } from "./parse-rider-form";

export interface RiderFormState {
  error?: string;
}

// Writes go through the parent's own RLS-bound session (riders has
// insert/update policies keyed on attendee_id = auth.uid()), so a forged
// riderId for someone else's child simply updates zero rows.
export async function saveRider(riderId: string | null, _prev: RiderFormState, formData: FormData): Promise<RiderFormState> {
  const attendee = await getCurrentAttendee();
  if (!attendee) return { error: "Please sign in again." };

  const parsed = parseRiderForm(formData, new Date().toISOString().slice(0, 10));
  if (!parsed.ok) return { error: parsed.error };

  const supabase = await createClient();
  if (riderId) {
    const { data, error } = await supabase.from("riders").update(parsed.values).eq("id", riderId).select("id");
    if (error) return { error: error.message };
    if (!data || data.length === 0) return { error: "Couldn't find that child on your account." };
  } else {
    const { error } = await supabase.from("riders").insert({ ...parsed.values, attendee_id: attendee.id });
    if (error) return { error: error.message };
  }

  revalidatePath("/my-events/children");
  redirect("/my-events/children");
}

// Archive, not delete: past bookings keep pointing at the rider
// (booking_people.rider_id), and the coach's history should still read.
export async function archiveRider(riderId: string): Promise<{ error?: string }> {
  const attendee = await getCurrentAttendee();
  if (!attendee) return { error: "Please sign in again." };

  const supabase = await createClient();
  const { error } = await supabase.from("riders").update({ archived_at: new Date().toISOString() }).eq("id", riderId);
  if (error) return { error: error.message };
  revalidatePath("/my-events/children");
  return {};
}
```

- [ ] **Step 6: UI components**

```tsx
// components/members/MembersNav.tsx
import Link from "next/link";

const TABS = [
  { key: "bookings", href: "/my-events", label: "Bookings" },
  { key: "children", href: "/my-events/children", label: "Children" },
] as const;

export type MembersTab = (typeof TABS)[number]["key"];

export default function MembersNav({ active }: { active: MembersTab }) {
  return (
    <nav style={{ display: "flex", gap: 18, borderBottom: "1px solid #E4E2DD", marginTop: 28 }}>
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className="mono"
          style={{
            fontSize: 12,
            fontWeight: 700,
            padding: "10px 0",
            color: t.key === active ? "#111111" : "#6B6B66",
            borderBottom: t.key === active ? "2px solid #111111" : "2px solid transparent",
          }}
        >
          {t.label.toUpperCase()}
        </Link>
      ))}
    </nav>
  );
}
```

```tsx
// components/members/RiderForm.tsx
"use client";

import { useActionState } from "react";
import { saveRider, type RiderFormState } from "@/lib/actions/riders";
import type { RiderRow } from "@/lib/supabase/types";

const label: React.CSSProperties = { fontSize: 10.5, color: "#6B6B66", display: "block", marginBottom: 6, letterSpacing: "0.03em" };
const input: React.CSSProperties = { width: "100%", background: "#FFFFFF", border: "1px solid #D8D6D0", color: "#111111", padding: "9px 11px", fontSize: 13.5 };
const field: React.CSSProperties = { marginBottom: 16 };

export default function RiderForm({ rider }: { rider: RiderRow | null }) {
  const bound = saveRider.bind(null, rider?.id ?? null);
  const [state, formAction, pending] = useActionState<RiderFormState, FormData>(bound, {});

  return (
    <form action={formAction} style={{ maxWidth: 480, background: "#F3F2EE", border: "1px solid #E4E2DD", padding: "20px 22px" }}>
      <div style={field}>
        <label className="mono" style={label}>CHILD&apos;S FULL NAME</label>
        <input style={input} name="name" defaultValue={rider?.name ?? ""} required />
      </div>
      <div style={field}>
        <label className="mono" style={label}>DATE OF BIRTH</label>
        <input style={{ ...input, maxWidth: 200 }} type="date" name="date_of_birth" defaultValue={rider?.date_of_birth ?? ""} required />
      </div>
      <div style={field}>
        <label className="mono" style={label}>EMERGENCY CONTACT NAME</label>
        <input style={input} name="emergency_contact_name" defaultValue={rider?.emergency_contact_name ?? ""} required />
      </div>
      <div style={field}>
        <label className="mono" style={label}>EMERGENCY CONTACT PHONE</label>
        <input style={input} type="tel" name="emergency_contact_phone" defaultValue={rider?.emergency_contact_phone ?? ""} required />
      </div>
      <div style={field}>
        <label className="mono" style={label}>MEDICAL INFORMATION THE COACH SHOULD KNOW (OPTIONAL)</label>
        <textarea style={{ ...input, minHeight: 80, resize: "vertical" }} name="medical_notes" defaultValue={rider?.medical_notes ?? ""} />
        <p style={{ fontSize: 11.5, color: "#6B6B66", marginTop: 6 }}>
          Only you, site admins, and coaches at clubs you book with can see this.
        </p>
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 18 }}>
        <input type="checkbox" name="photo_consent" defaultChecked={rider?.photo_consent ?? false} />
        Coaches may photograph this child for club use
      </label>
      <button
        type="submit"
        disabled={pending}
        style={{ background: "#111111", color: "#FAFAF8", border: "none", padding: "12px 24px", fontWeight: 700, fontSize: 13.5, cursor: pending ? "default" : "pointer", opacity: pending ? 0.6 : 1 }}
      >
        {pending ? "Saving…" : "Save"}
      </button>
      {state.error && <p style={{ color: "#A13A2A", fontSize: 12.5, marginTop: 14 }}>{state.error}</p>}
    </form>
  );
}
```

```tsx
// components/members/RidersList.tsx
"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { archiveRider } from "@/lib/actions/riders";
import { riderAgeCategory } from "@/lib/riders/age-category";
import type { RiderRow } from "@/lib/supabase/types";

export default function RidersList({ riders }: { riders: RiderRow[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);

  async function handleRemove(id: string) {
    if (!confirm("Remove this child from your account? Past bookings are kept.")) return;
    const result = await archiveRider(id);
    if (result.error) setError(result.error);
    else router.refresh();
  }

  if (riders.length === 0) {
    return <p style={{ color: "#6B6B66", fontSize: 13.5 }}>No children saved yet. Add one so booking is a single tap.</p>;
  }

  return (
    <div style={{ borderTop: "2px solid #111111" }}>
      {riders.map((r) => (
        <div key={r.id} style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", padding: "14px 6px", borderBottom: "1px solid #E4E2DD" }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{r.name}</div>
            <div className="mono" style={{ fontSize: 11.5, color: "#6B6B66", marginTop: 4 }}>
              {riderAgeCategory(r, today).toUpperCase()}
              {r.date_of_birth ? "" : " · ADD A DATE OF BIRTH"}
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <Link href={`/my-events/children/${r.id}/edit`} className="mono" style={{ fontSize: 11.5, border: "1px solid #D8D6D0", padding: "7px 14px", color: "#111111" }}>
              Edit
            </Link>
            <button type="button" onClick={() => handleRemove(r.id)} className="mono" style={{ fontSize: 11.5, color: "#A13A2A", background: "none", border: "1px solid #D8D6D0", padding: "7px 14px", cursor: "pointer" }}>
              Remove
            </button>
          </div>
        </div>
      ))}
      {error && <p style={{ color: "#A13A2A", fontSize: 12.5, marginTop: 10 }}>{error}</p>}
    </div>
  );
}
```

Guest-created riders have no DOB, so the parent is prompted to add one. `RiderForm` requires a DOB on save, which fills it in.

- [ ] **Step 7: Pages**

```tsx
// app/my-events/(protected)/children/page.tsx
import Link from "next/link";
import { getCurrentAttendee } from "@/lib/auth";
import { getMyRiders } from "@/lib/data";
import MembersNav from "@/components/members/MembersNav";
import RidersList from "@/components/members/RidersList";

export default async function ChildrenPage() {
  const attendee = await getCurrentAttendee();
  const riders = attendee ? await getMyRiders(attendee.id) : [];

  return (
    <header style={{ maxWidth: 1100, margin: "0 auto", padding: "56px 24px 120px" }}>
      <div className="mono" style={{ fontSize: 11.5, letterSpacing: "0.12em", color: "#E0102A", marginBottom: 16, fontWeight: 700 }}>MEMBERS CENTRE</div>
      <h1 className="disp" style={{ fontSize: "clamp(32px, 5.2vw, 52px)", lineHeight: 1.02, margin: 0, letterSpacing: "-0.01em" }}>Your children.</h1>
      <MembersNav active="children" />
      <div style={{ marginTop: 28, marginBottom: 20 }}>
        <Link href="/my-events/children/new" style={{ display: "inline-block", background: "#111111", color: "#FAFAF8", padding: "10px 20px", fontWeight: 700, fontSize: 13 }}>
          + Add a child
        </Link>
      </div>
      <RidersList riders={riders} />
    </header>
  );
}
```

```tsx
// app/my-events/(protected)/children/new/page.tsx
import RiderForm from "@/components/members/RiderForm";

export default function NewChildPage() {
  return (
    <header style={{ maxWidth: 1100, margin: "0 auto", padding: "56px 24px 120px" }}>
      <div className="mono" style={{ fontSize: 11.5, letterSpacing: "0.12em", color: "#E0102A", marginBottom: 16, fontWeight: 700 }}>MEMBERS CENTRE</div>
      <h1 className="disp" style={{ fontSize: "clamp(28px, 4.5vw, 40px)", lineHeight: 1.05, margin: 0, marginBottom: 28 }}>Add a child.</h1>
      <RiderForm rider={null} />
    </header>
  );
}
```

```tsx
// app/my-events/(protected)/children/[id]/edit/page.tsx
import { notFound } from "next/navigation";
import { getMyRider } from "@/lib/data";
import RiderForm from "@/components/members/RiderForm";

export default async function EditChildPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rider = await getMyRider(id);
  if (!rider) notFound();

  return (
    <header style={{ maxWidth: 1100, margin: "0 auto", padding: "56px 24px 120px" }}>
      <div className="mono" style={{ fontSize: 11.5, letterSpacing: "0.12em", color: "#E0102A", marginBottom: 16, fontWeight: 700 }}>MEMBERS CENTRE</div>
      <h1 className="disp" style={{ fontSize: "clamp(28px, 4.5vw, 40px)", lineHeight: 1.05, margin: 0, marginBottom: 28 }}>Edit {rider.name}.</h1>
      <RiderForm rider={rider} />
    </header>
  );
}
```

In `app/my-events/(protected)/page.tsx`: change the eyebrow `MY BOOKINGS` to `MEMBERS CENTRE`, insert `<MembersNav active="bookings" />` after the "Signed in as" paragraph, and import it. The `(protected)/layout.tsx` redirect already gates every new route.

- [ ] **Step 8: Verify**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: clean.

Manual (preview): sign in at `/my-events/login` as a test parent, add a child, edit them, remove them. Each lands back on `/my-events/children` with the list updated.

- [ ] **Step 9: Commit**

```bash
git add lib/actions/parse-rider-form.ts lib/actions/parse-rider-form.test.ts lib/actions/riders.ts lib/data.ts components/members app/my-events
git commit -m "Let parents save their children's details in a members centre"
```

---

### Task 5: Club staff and club groups

**Files:**
- Modify: `lib/auth.ts` (add `canManageClub`)
- Create: `lib/actions/parse-club-group-form.ts`
- Create: `lib/actions/parse-club-group-form.test.ts`
- Create: `lib/actions/club-groups.ts`
- Create: `lib/actions/club-staff.ts`
- Modify: `lib/data.ts` (add `getClubGroups`, `getClubStaff`, `getMyStaffClubs`)
- Create: `components/clubs/ClubGroupsEditor.tsx`
- Create: `components/clubs/ClubStaffEditor.tsx`
- Create: `app/organiser/clubs/[id]/groups/page.tsx`
- Modify: `app/admin/clubs/[id]/edit/page.tsx` (render `ClubStaffEditor` under the form)
- Modify: `app/organiser/page.tsx` (a "Your clubs" panel)

**Interfaces:**
- Consumes: `is_club_staff` RPC, `ClubGroupRow`, `poundsToPence`/`formatPence` (Task 1).
- Produces:
  - `canManageClub(profile: ProfileRow | null, clubId: string): Promise<boolean>`
  - `parseClubGroupForm(formData: FormData): { ok: false; error: string } | { ok: true; values: { name: string; description: string | null; price_pence: number; sort_order: number } }`
  - `saveClubGroup(clubId: string, groupId: string | null, _prev: ClubGroupFormState, formData: FormData): Promise<ClubGroupFormState>` with `ClubGroupFormState = { error?: string; saved?: boolean }`
  - `setClubGroupActive(groupId: string, active: boolean): Promise<{ error?: string }>`
  - `addClubStaff(clubId: string, _prev: ClubStaffFormState, formData: FormData): Promise<ClubStaffFormState>` with `ClubStaffFormState = { error?: string; success?: string }`
  - `removeClubStaff(clubId: string, profileId: string): Promise<{ error?: string }>`
  - `getClubGroups(clubId: string, opts?: { includeInactive?: boolean }): Promise<ClubGroupRow[]>` (by `sort_order`, then name)
  - `getClubStaff(clubId: string): Promise<Pick<ProfileRow, "id" | "email">[]>`
  - `getMyStaffClubs(profileId: string): Promise<{ id: string; name: string }[]>`

- [ ] **Step 1: Write the failing parser test**

```ts
// lib/actions/parse-club-group-form.test.ts
import { describe, expect, it } from "vitest";
import { parseClubGroupForm } from "./parse-club-group-form";

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

describe("parseClubGroupForm", () => {
  it("parses Mid Devon's Group 3", () => {
    expect(parseClubGroupForm(fd({ name: "Group 3", description: "2 hours, 9–11am", price: "6", sort_order: "3" }))).toEqual({
      ok: true,
      values: { name: "Group 3", description: "2 hours, 9–11am", price_pence: 600, sort_order: 3 },
    });
  });
  it("defaults sort order to 0 and blank description to null", () => {
    expect(parseClubGroupForm(fd({ name: "Group 1", price: "3.50" }))).toEqual({
      ok: true,
      values: { name: "Group 1", description: null, price_pence: 350, sort_order: 0 },
    });
  });
  it("requires a name", () => {
    expect(parseClubGroupForm(fd({ name: " ", price: "3.50" }))).toEqual({ ok: false, error: "Group name is required." });
  });
  it("rejects an unparseable price", () => {
    expect(parseClubGroupForm(fd({ name: "Group 1", price: "three fifty" }))).toEqual({
      ok: false,
      error: "Price must be an amount in pounds, like 3.50.",
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- parse-club-group-form`
Expected: FAIL, cannot resolve module.

- [ ] **Step 3: Implement the parser**

```ts
// lib/actions/parse-club-group-form.ts
import { poundsToPence } from "@/lib/money";

export function parseClubGroupForm(
  formData: FormData
):
  | { ok: false; error: string }
  | { ok: true; values: { name: string; description: string | null; price_pence: number; sort_order: number } } {
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const pricePence = poundsToPence(String(formData.get("price") ?? ""));
  const sortOrder = Number(String(formData.get("sort_order") ?? "").trim() || "0");

  if (!name) return { ok: false, error: "Group name is required." };
  if (pricePence === null) return { ok: false, error: "Price must be an amount in pounds, like 3.50." };
  if (!Number.isInteger(sortOrder)) return { ok: false, error: "Order must be a whole number." };

  return { ok: true, values: { name, description, price_pence: pricePence, sort_order: sortOrder } };
}
```

Run: `npm test -- parse-club-group-form`. Expected: PASS.

- [ ] **Step 4: `canManageClub`, data helpers, actions**

Append to `lib/auth.ts`:

```ts
// Club-scoped permission (coach at this club, or any admin). Delegates to
// the same is_club_staff() SQL function RLS uses, so the UI gate and the
// database boundary can't drift apart.
export async function canManageClub(profile: ProfileRow | null, clubId: string): Promise<boolean> {
  if (!profile) return false;
  if (isAdminRole(profile)) return true;
  const supabase = await createClient();
  const { data } = await supabase.rpc("is_club_staff", { p_club_id: clubId });
  return data === true;
}
```

Append to `lib/data.ts` (import `ClubGroupRow`):

```ts
export async function getClubGroups(clubId: string, opts: { includeInactive?: boolean } = {}): Promise<ClubGroupRow[]> {
  const supabase = await createClient();
  let query = supabase.from("club_groups").select("*").eq("club_id", clubId);
  if (!opts.includeInactive) query = query.eq("active", true);
  const { data, error } = await query.order("sort_order", { ascending: true }).order("name", { ascending: true });
  if (error) throw error;
  return data as ClubGroupRow[];
}

export async function getClubStaff(clubId: string): Promise<Pick<ProfileRow, "id" | "email">[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("club_staff").select("profile:profiles(id, email)").eq("club_id", clubId);
  if (error) throw error;
  return (data as unknown as { profile: Pick<ProfileRow, "id" | "email"> }[]).map((r) => r.profile);
}

export async function getMyStaffClubs(profileId: string): Promise<{ id: string; name: string }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("club_staff").select("club:clubs(id, name)").eq("profile_id", profileId);
  if (error) throw error;
  return (data as unknown as { club: { id: string; name: string } }[]).map((r) => r.club);
}
```

```ts
// lib/actions/club-groups.ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { canManageClub, getCurrentProfile } from "@/lib/auth";
import { parseClubGroupForm } from "./parse-club-group-form";

export interface ClubGroupFormState {
  error?: string;
  saved?: boolean;
}

// RLS (is_club_staff) is the real boundary on club_groups writes; the
// canManageClub check just turns a silent zero-row write into a sentence.
export async function saveClubGroup(
  clubId: string,
  groupId: string | null,
  _prev: ClubGroupFormState,
  formData: FormData
): Promise<ClubGroupFormState> {
  const profile = await getCurrentProfile();
  if (!(await canManageClub(profile, clubId))) return { error: "Not authorised for this club." };

  const parsed = parseClubGroupForm(formData);
  if (!parsed.ok) return { error: parsed.error };

  const supabase = await createClient();
  const { error } = groupId
    ? await supabase.from("club_groups").update(parsed.values).eq("id", groupId).eq("club_id", clubId)
    : await supabase.from("club_groups").insert({ ...parsed.values, club_id: clubId });
  if (error) return { error: error.message };

  revalidatePath(`/organiser/clubs/${clubId}/groups`);
  return { saved: true };
}

export async function setClubGroupActive(groupId: string, active: boolean): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("club_groups").update({ active }).eq("id", groupId).select("club_id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "Not authorised for this club." };
  revalidatePath(`/organiser/clubs/${data[0].club_id}/groups`);
  return {};
}
```

```ts
// lib/actions/club-staff.ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, isAdminRole } from "@/lib/auth";

export interface ClubStaffFormState {
  error?: string;
  success?: string;
}

// Admin-only (RLS: club_staff insert/delete use is_admin()). The person must
// already have a profile, i.e. have been invited via /admin/team; this
// deliberately doesn't create accounts.
export async function addClubStaff(clubId: string, _prev: ClubStaffFormState, formData: FormData): Promise<ClubStaffFormState> {
  const profile = await getCurrentProfile();
  if (!isAdminRole(profile)) return { error: "Only admins can add coaches." };

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) return { error: "Email is required." };

  const supabase = await createClient();
  const { data: target } = await supabase.from("profiles").select("id").eq("email", email).maybeSingle();
  if (!target) return { error: "No organiser account with that email. Invite them from Team first." };

  const { error } = await supabase.from("club_staff").insert({ club_id: clubId, profile_id: target.id });
  if (error && error.code !== "23505") return { error: error.message };

  revalidatePath(`/admin/clubs/${clubId}/edit`);
  return { success: `${email} can now manage this club's groups and see its session rosters.` };
}

export async function removeClubStaff(clubId: string, profileId: string): Promise<{ error?: string }> {
  const profile = await getCurrentProfile();
  if (!isAdminRole(profile)) return { error: "Only admins can remove coaches." };

  const supabase = await createClient();
  const { error } = await supabase.from("club_staff").delete().eq("club_id", clubId).eq("profile_id", profileId);
  if (error) return { error: error.message };
  revalidatePath(`/admin/clubs/${clubId}/edit`);
  return {};
}
```

- [ ] **Step 5: Editors and pages**

```tsx
// components/clubs/ClubGroupsEditor.tsx
"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { saveClubGroup, setClubGroupActive, type ClubGroupFormState } from "@/lib/actions/club-groups";
import { formatPence } from "@/lib/money";
import type { ClubGroupRow } from "@/lib/supabase/types";

const input: React.CSSProperties = { background: "#FFFFFF", border: "1px solid #D8D6D0", color: "#111111", padding: "8px 10px", fontSize: 13 };

function GroupRow({ clubId, group }: { clubId: string; group: ClubGroupRow | null }) {
  const router = useRouter();
  const bound = saveClubGroup.bind(null, clubId, group?.id ?? null);
  const [state, formAction, pending] = useActionState<ClubGroupFormState, FormData>(bound, {});
  const [toggleError, setToggleError] = useState<string | null>(null);

  async function toggle() {
    if (!group) return;
    const r = await setClubGroupActive(group.id, !group.active);
    if (r.error) setToggleError(r.error);
    else router.refresh();
  }

  return (
    <form action={formAction} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #E4E2DD", opacity: group && !group.active ? 0.55 : 1 }}>
      <input style={{ ...input, width: 60 }} name="sort_order" type="number" defaultValue={group?.sort_order ?? 0} aria-label="Order" />
      <input style={{ ...input, width: 140 }} name="name" defaultValue={group?.name ?? ""} placeholder="Group 1" required />
      <input style={{ ...input, flex: "1 1 200px" }} name="description" defaultValue={group?.description ?? ""} placeholder="1 hour, Saturdays 9–10am" />
      <input style={{ ...input, width: 90 }} name="price" defaultValue={group ? (group.price_pence / 100).toFixed(2) : ""} placeholder="3.50" required aria-label="Price (£)" />
      <button type="submit" disabled={pending} className="mono" style={{ fontSize: 11.5, fontWeight: 700, border: "1px solid #111111", background: "none", padding: "7px 12px", cursor: "pointer" }}>
        {group ? "Save" : "Add group"}
      </button>
      {group && (
        <button type="button" onClick={toggle} className="mono" style={{ fontSize: 11.5, border: "1px solid #D8D6D0", background: "none", padding: "7px 12px", cursor: "pointer" }}>
          {group.active ? "Retire" : "Restore"}
        </button>
      )}
      {group && <span className="mono" style={{ fontSize: 11, color: "#6B6B66" }}>{formatPence(group.price_pence)} per child</span>}
      {(state.error || toggleError) && <span style={{ color: "#A13A2A", fontSize: 12 }}>{state.error ?? toggleError}</span>}
      {state.saved && !group && <span style={{ color: "#6B6B66", fontSize: 12 }}>Added.</span>}
    </form>
  );
}

export default function ClubGroupsEditor({ clubId, groups }: { clubId: string; groups: ClubGroupRow[] }) {
  return (
    <div style={{ borderTop: "2px solid #111111" }}>
      {groups.map((g) => (
        <GroupRow key={g.id} clubId={clubId} group={g} />
      ))}
      <GroupRow key={`new-${groups.length}`} clubId={clubId} group={null} />
    </div>
  );
}
```

```tsx
// components/clubs/ClubStaffEditor.tsx
"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { addClubStaff, removeClubStaff, type ClubStaffFormState } from "@/lib/actions/club-staff";

export default function ClubStaffEditor({ clubId, staff }: { clubId: string; staff: { id: string; email: string }[] }) {
  const router = useRouter();
  const bound = addClubStaff.bind(null, clubId);
  const [state, formAction, pending] = useActionState<ClubStaffFormState, FormData>(bound, {});

  return (
    <section style={{ marginTop: 40, maxWidth: 560 }}>
      <h2 className="disp" style={{ fontSize: 20, marginBottom: 6 }}>Coaches</h2>
      <p style={{ fontSize: 13, color: "#4A4A46", marginBottom: 14 }}>
        Coaches can set this club&apos;s groups and prices, put children in groups, and see session rosters, including emergency contacts and medical notes.
      </p>
      {staff.map((s) => (
        <div key={s.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #E4E2DD", fontSize: 13.5 }}>
          {s.email}
          <button
            type="button"
            onClick={async () => {
              await removeClubStaff(clubId, s.id);
              router.refresh();
            }}
            className="mono"
            style={{ fontSize: 11, color: "#A13A2A", background: "none", border: "none", cursor: "pointer" }}
          >
            Remove
          </button>
        </div>
      ))}
      <form action={formAction} style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <input name="email" type="email" placeholder="coach@example.com" required style={{ flex: 1, border: "1px solid #D8D6D0", padding: "8px 10px", fontSize: 13 }} />
        <button type="submit" disabled={pending} className="mono" style={{ fontSize: 11.5, fontWeight: 700, border: "1px solid #111111", background: "none", padding: "7px 12px", cursor: "pointer" }}>
          Add coach
        </button>
      </form>
      {state.error && <p style={{ color: "#A13A2A", fontSize: 12.5, marginTop: 8 }}>{state.error}</p>}
      {state.success && <p style={{ color: "#6B6B66", fontSize: 12.5, marginTop: 8 }}>{state.success}</p>}
    </section>
  );
}
```

```tsx
// app/organiser/clubs/[id]/groups/page.tsx
import { notFound } from "next/navigation";
import { getClubById, getClubGroups } from "@/lib/data";
import { canManageClub, getCurrentProfile } from "@/lib/auth";
import ClubGroupsEditor from "@/components/clubs/ClubGroupsEditor";

export default async function ClubGroupsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const club = await getClubById(id);
  if (!club) notFound();
  if (!(await canManageClub(await getCurrentProfile(), id))) notFound();

  const groups = await getClubGroups(id, { includeInactive: true });

  return (
    <header style={{ maxWidth: 1100, margin: "0 auto", padding: "56px 24px 120px" }}>
      <div className="mono" style={{ fontSize: 11.5, letterSpacing: "0.12em", color: "#E0102A", marginBottom: 16, fontWeight: 700 }}>{club.name.toUpperCase()}</div>
      <h1 className="disp" style={{ fontSize: "clamp(28px, 4.5vw, 40px)", lineHeight: 1.05, margin: 0, marginBottom: 12 }}>Groups.</h1>
      <p style={{ maxWidth: 560, fontSize: 13.5, color: "#4A4A46", marginBottom: 24 }}>
        Each child is put in one group. When paid sessions are switched on, a child pays their group&apos;s price. Retired groups stay on past bookings.
      </p>
      <ClubGroupsEditor clubId={id} groups={groups} />
    </header>
  );
}
```

In `app/admin/clubs/[id]/edit/page.tsx`, after the existing `<ClubForm ... />`, add:

```tsx
      <ClubStaffEditor clubId={id} staff={await getClubStaff(id)} />
```

with imports `ClubStaffEditor` from `@/components/clubs/ClubStaffEditor` and `getClubStaff` from `@/lib/data`. (Check the page's param variable name first. If it isn't `id`, use whatever it destructures.)

In `app/organiser/page.tsx`, read `profile` the way the page already does, then render a "Your clubs" panel above the events list when `getMyStaffClubs(profile.id)` is non-empty. Each club gets one row with links to `/organiser/clubs/{id}/groups`, plus (added in Task 7) its sessions:

```tsx
      {staffClubs.length > 0 && (
        <section style={{ marginBottom: 36 }}>
          <h2 className="disp" style={{ fontSize: 20, marginBottom: 10 }}>Your clubs</h2>
          {staffClubs.map((c) => (
            <div key={c.id} style={{ display: "flex", gap: 14, padding: "10px 0", borderBottom: "1px solid #E4E2DD", fontSize: 14 }}>
              <strong style={{ flex: 1 }}>{c.name}</strong>
              <a href={`/organiser/clubs/${c.id}/groups`} className="mono" style={{ fontSize: 11.5 }}>Groups</a>
            </div>
          ))}
        </section>
      )}
```

- [ ] **Step 6: Verify**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: clean.

Manual (preview, as super admin): on Mid Devon CC's admin edit page, add yourself as a coach. On `/organiser`, "Your clubs" lists Mid Devon. On its Groups page, add Group 1 (£3.50, "1 hour"), Group 2 (£3.50, "1 hour"), Group 3 (£6.00, "2 hours"). Retire and restore one. A non-staff organiser visiting `/organiser/clubs/<mid-devon-id>/groups` gets a 404.

- [ ] **Step 7: Commit**

```bash
git add lib/auth.ts lib/actions/parse-club-group-form.ts lib/actions/parse-club-group-form.test.ts lib/actions/club-groups.ts lib/actions/club-staff.ts lib/data.ts components/clubs/ClubGroupsEditor.tsx components/clubs/ClubStaffEditor.tsx app/organiser app/admin/clubs
git commit -m "Let clubs define priced groups and name their coaches"
```

---

### Task 6: Book with saved children (and remember guests' children)

**Files:**
- Create: `lib/riders/resolve-groups.ts`
- Create: `lib/riders/resolve-groups.test.ts`
- Create: `lib/actions/parse-rider-booking-form.ts`
- Create: `lib/actions/parse-rider-booking-form.test.ts`
- Modify: `lib/actions/bookings.ts` (add `createRiderBooking`; guest `createBooking` saves riders)
- Modify: `lib/data.ts` (add `getRiderGroupAssignments`)
- Create: `components/events/RiderSignupForm.tsx`
- Modify: `app/events/[id]/page.tsx`
- Modify: `lib/email/booking-confirmation.ts` (optional group name per person)

**Interfaces:**
- Consumes: `riderAgeCategory` (Task 1), `RiderRow`/`ClubGroupRow`/`RiderClubGroupRow` (Task 2), `getMyRiders`, `getClubGroups`.
- Produces:
  - `resolveRiderGroups(input: { riders: { id: string; name: string }[]; assignments: Pick<RiderClubGroupRow, "rider_id" | "group_id" | "assigned_by">[]; choices: Record<string, string>; activeGroupIds: string[] }): { ok: false; error: string } | { ok: true; groupByRider: Record<string, string | null>; toSave: { riderId: string; groupId: string }[] }`
  - `parseRiderBookingForm(formData: FormData): { ok: false; error: string } | { ok: true; riderIds: string[]; groupChoices: Record<string, string> }`
  - `createRiderBooking(eventId: string, _prev: CreateBookingState, formData: FormData): Promise<CreateBookingState>` (same state type as `createBooking`)
  - `getRiderGroupAssignments(riderIds: string[], clubId: string): Promise<RiderClubGroupRow[]>`
  - `BookingPersonInput` gains optional `groupName?: string | null` for the email.
  - Form field names: `rider_id` (repeated checkbox), `group:<riderId>` (select).

- [ ] **Step 1: Write the failing tests**

```ts
// lib/riders/resolve-groups.test.ts
import { describe, expect, it } from "vitest";
import { resolveRiderGroups } from "./resolve-groups";

const riders = [
  { id: "r1", name: "Ada" },
  { id: "r2", name: "Ben" },
];
const G1 = "g1";
const G3 = "g3";

describe("resolveRiderGroups", () => {
  it("returns null groups when the club has no groups", () => {
    expect(resolveRiderGroups({ riders, assignments: [], choices: {}, activeGroupIds: [] })).toEqual({
      ok: true,
      groupByRider: { r1: null, r2: null },
      toSave: [],
    });
  });

  it("uses a coach's assignment and ignores the parent's choice", () => {
    const r = resolveRiderGroups({
      riders: [riders[0]],
      assignments: [{ rider_id: "r1", group_id: G3, assigned_by: "coach-1" }],
      choices: { r1: G1 },
      activeGroupIds: [G1, G3],
    });
    expect(r).toEqual({ ok: true, groupByRider: { r1: G3 }, toSave: [] });
  });

  it("lets a parent change their own earlier choice", () => {
    const r = resolveRiderGroups({
      riders: [riders[0]],
      assignments: [{ rider_id: "r1", group_id: G1, assigned_by: null }],
      choices: { r1: G3 },
      activeGroupIds: [G1, G3],
    });
    expect(r).toEqual({ ok: true, groupByRider: { r1: G3 }, toSave: [{ riderId: "r1", groupId: G3 }] });
  });

  it("keeps a parent's earlier choice when no new one is sent", () => {
    const r = resolveRiderGroups({
      riders: [riders[0]],
      assignments: [{ rider_id: "r1", group_id: G1, assigned_by: null }],
      choices: {},
      activeGroupIds: [G1, G3],
    });
    expect(r).toEqual({ ok: true, groupByRider: { r1: G1 }, toSave: [] });
  });

  it("saves a first-time choice", () => {
    const r = resolveRiderGroups({ riders: [riders[1]], assignments: [], choices: { r2: G1 }, activeGroupIds: [G1, G3] });
    expect(r).toEqual({ ok: true, groupByRider: { r2: G1 }, toSave: [{ riderId: "r2", groupId: G1 }] });
  });

  it("asks for a group when an unassigned child has none chosen", () => {
    expect(resolveRiderGroups({ riders: [riders[1]], assignments: [], choices: {}, activeGroupIds: [G1] })).toEqual({
      ok: false,
      error: "Pick a group for Ben.",
    });
  });

  it("rejects a choice that isn't one of the club's active groups", () => {
    expect(resolveRiderGroups({ riders: [riders[1]], assignments: [], choices: { r2: "nope" }, activeGroupIds: [G1] })).toEqual({
      ok: false,
      error: "Pick a group for Ben.",
    });
  });
});
```

```ts
// lib/actions/parse-rider-booking-form.test.ts
import { describe, expect, it } from "vitest";
import { parseRiderBookingForm } from "./parse-rider-booking-form";

describe("parseRiderBookingForm", () => {
  it("collects ticked riders (deduped) and their group choices", () => {
    const f = new FormData();
    f.append("rider_id", "r1");
    f.append("rider_id", "r2");
    f.append("rider_id", "r1");
    f.set("group:r1", "g3");
    f.set("group:r9", "g1"); // not ticked, so ignored
    expect(parseRiderBookingForm(f)).toEqual({ ok: true, riderIds: ["r1", "r2"], groupChoices: { r1: "g3" } });
  });
  it("requires at least one child", () => {
    expect(parseRiderBookingForm(new FormData())).toEqual({ ok: false, error: "Tick at least one child." });
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -- resolve-groups parse-rider-booking-form`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

```ts
// lib/riders/resolve-groups.ts
import type { RiderClubGroupRow } from "@/lib/supabase/types";

// Spec rule: a parent may choose a child's group only until a coach has set
// one (assigned_by non-null); after that the coach's choice always wins.
// A club with no active groups books children with no group at all.
export function resolveRiderGroups(input: {
  riders: { id: string; name: string }[];
  assignments: Pick<RiderClubGroupRow, "rider_id" | "group_id" | "assigned_by">[];
  choices: Record<string, string>;
  activeGroupIds: string[];
}):
  | { ok: false; error: string }
  | { ok: true; groupByRider: Record<string, string | null>; toSave: { riderId: string; groupId: string }[] } {
  const groupByRider: Record<string, string | null> = {};
  const toSave: { riderId: string; groupId: string }[] = [];

  if (input.activeGroupIds.length === 0) {
    for (const r of input.riders) groupByRider[r.id] = null;
    return { ok: true, groupByRider, toSave };
  }

  for (const rider of input.riders) {
    const existing = input.assignments.find((a) => a.rider_id === rider.id);
    if (existing?.assigned_by) {
      groupByRider[rider.id] = existing.group_id;
      continue;
    }
    const choice = input.choices[rider.id];
    if (choice && input.activeGroupIds.includes(choice)) {
      groupByRider[rider.id] = choice;
      if (choice !== existing?.group_id) toSave.push({ riderId: rider.id, groupId: choice });
      continue;
    }
    if (existing && !choice) {
      groupByRider[rider.id] = existing.group_id;
      continue;
    }
    return { ok: false, error: `Pick a group for ${rider.name}.` };
  }

  return { ok: true, groupByRider, toSave };
}
```

```ts
// lib/actions/parse-rider-booking-form.ts
export function parseRiderBookingForm(
  formData: FormData
): { ok: false; error: string } | { ok: true; riderIds: string[]; groupChoices: Record<string, string> } {
  const riderIds = [...new Set(formData.getAll("rider_id").map(String).filter(Boolean))];
  if (riderIds.length === 0) return { ok: false, error: "Tick at least one child." };

  const groupChoices: Record<string, string> = {};
  for (const id of riderIds) {
    const choice = String(formData.get(`group:${id}`) ?? "").trim();
    if (choice) groupChoices[id] = choice;
  }
  return { ok: true, riderIds, groupChoices };
}
```

Run: `npm test`. Expected: PASS.

- [ ] **Step 4: Data helper and the server action**

Append to `lib/data.ts`:

```ts
export async function getRiderGroupAssignments(riderIds: string[], clubId: string): Promise<RiderClubGroupRow[]> {
  if (riderIds.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.from("rider_club_groups").select("*").eq("club_id", clubId).in("rider_id", riderIds);
  if (error) throw error;
  return data as RiderClubGroupRow[];
}
```

Add to `lib/actions/bookings.ts` (new imports: `getCurrentAttendee` from `@/lib/auth`, `getClubGroups`/`getRiderGroupAssignments` from `@/lib/data`, `parseRiderBookingForm`, `resolveRiderGroups`, `riderAgeCategory`, and `RiderRow` type):

```ts
// Signed-in members-centre path: the children already exist as riders, so
// the parent just ticks who's coming. Writes use the service-role client
// (create_booking is service_role-only; rider_club_groups has no write
// policies), after every ownership check below has passed.
export async function createRiderBooking(
  eventId: string,
  _prevState: CreateBookingState,
  formData: FormData
): Promise<CreateBookingState> {
  const attendee = await getCurrentAttendee();
  if (!attendee) return { error: "Please sign in again." };

  const parsed = parseRiderBookingForm(formData);
  if (!parsed.ok) return { error: parsed.error };

  const admin = createAdminClient();
  const { data: eventData } = await admin.from("events").select("*").eq("id", eventId).single();
  const event = eventData as EventRow | null;
  if (!event || !event.bookable || !event.approved) return { error: "This event isn't taking bookings." };

  const supabase = await createClient();
  const { data: riderData } = await supabase
    .from("riders")
    .select("*")
    .in("id", parsed.riderIds)
    .eq("attendee_id", attendee.id)
    .is("archived_at", null);
  const riders = (riderData ?? []) as RiderRow[];
  if (riders.length !== parsed.riderIds.length) return { error: "One of those children isn't on your account." };

  // One active place per child per session.
  const { data: already } = await admin
    .from("booking_people")
    .select("rider_id, booking:bookings!inner(event_id, status)")
    .in("rider_id", parsed.riderIds)
    .eq("booking.event_id", eventId)
    .neq("booking.status", "cancelled");
  if (already && already.length > 0) {
    const dupe = riders.find((r) => r.id === (already[0] as { rider_id: string }).rider_id);
    return { error: `${dupe?.name ?? "One of those children"} is already booked on this session.` };
  }

  let groupByRider: Record<string, string | null> = Object.fromEntries(riders.map((r) => [r.id, null]));
  const groupNames: Record<string, string> = {};
  if (event.club_id) {
    const groups = await getClubGroups(event.club_id);
    for (const g of groups) groupNames[g.id] = g.name;
    const resolved = resolveRiderGroups({
      riders,
      assignments: await getRiderGroupAssignments(parsed.riderIds, event.club_id),
      choices: parsed.groupChoices,
      activeGroupIds: groups.map((g) => g.id),
    });
    if (!resolved.ok) return { error: resolved.error };
    groupByRider = resolved.groupByRider;
    if (resolved.toSave.length > 0) {
      const { error } = await admin.from("rider_club_groups").upsert(
        resolved.toSave.map((s) => ({ rider_id: s.riderId, club_id: event.club_id!, group_id: s.groupId, assigned_by: null, assigned_at: new Date().toISOString() }))
      );
      if (error) return { error: error.message };
    }
  }

  const sessionDate = event.start_datetime.slice(0, 10);
  const people = riders.map((r) => ({
    name: r.name,
    age_category: riderAgeCategory(r, sessionDate),
    rider_id: r.id,
    group_id: groupByRider[r.id],
  }));

  const { data: result, error: rpcError } = await admin.rpc("create_booking", {
    p_event_id: eventId,
    p_attendee_id: attendee.id,
    p_people: people,
  });
  if (rpcError || !result || result.length === 0) return { error: rpcError?.message ?? "Couldn't complete the booking." };
  const status = result[0].status as "confirmed" | "waitlisted";

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  try {
    await sendEmail({
      to: attendee.email,
      subject: status === "confirmed" ? `You're in: ${event.title}` : `Waitlisted: ${event.title}`,
      html: buildBookingConfirmationHtml({
        event,
        status,
        people: people.map((p) => ({ name: p.name, ageCategory: p.age_category, groupName: p.group_id ? groupNames[p.group_id] : null })),
        manageUrl: `${siteUrl}/my-events`,
      }),
    });
  } catch {
    // Best-effort, same as createBooking.
  }

  return { success: { status } };
}
```

In `createBooking` (guest path), after `const status = ...` and **before** sending email, save each child as a rider so they're remembered next time. Skip names the parent already has, case-insensitively:

```ts
  // Remember guest-entered children as riders so the parent's next booking
  // (signed in via the email's magic link) is a tick box. Best-effort: the
  // booking itself already succeeded.
  try {
    const { data: existingRiders } = await admin.from("riders").select("name").eq("attendee_id", attendeeId);
    const known = new Set((existingRiders ?? []).map((r) => (r as { name: string }).name.toLowerCase()));
    const fresh = parsed.values.people.filter((p) => !known.has(p.name.toLowerCase()));
    if (fresh.length > 0) {
      await admin.from("riders").insert(fresh.map((p) => ({ attendee_id: attendeeId, name: p.name, age_category: p.ageCategory })));
    }
  } catch {
    // Non-fatal.
  }
```

- [ ] **Step 5: Email shows groups**

In `lib/actions/parse-booking-form.ts`, add `groupName?: string | null;` to `BookingPersonInput`. In `lib/email/booking-confirmation.ts`, change `peopleList` to:

```ts
  const peopleList = people
    .map((p) => `${escapeHtml(p.name)} (${p.ageCategory.toUpperCase()}${p.groupName ? ` · ${escapeHtml(p.groupName)}` : ""})`)
    .join(", ");
```

- [ ] **Step 6: `RiderSignupForm` and the event page**

```tsx
// components/events/RiderSignupForm.tsx
"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { createRiderBooking, type CreateBookingState } from "@/lib/actions/bookings";
import type { ClubGroupRow, RiderClubGroupRow, RiderRow } from "@/lib/supabase/types";

const select: React.CSSProperties = { background: "#FFFFFF", border: "1px solid #D8D6D0", padding: "6px 8px", fontSize: 13 };

export default function RiderSignupForm({
  eventId,
  spacesLeft,
  riders,
  groups,
  assignments,
}: {
  eventId: string;
  spacesLeft: number | null;
  riders: RiderRow[];
  groups: ClubGroupRow[];
  assignments: RiderClubGroupRow[];
}) {
  const bound = createRiderBooking.bind(null, eventId);
  const [state, formAction, pending] = useActionState<CreateBookingState, FormData>(bound, {});
  const [ticked, setTicked] = useState<Set<string>>(new Set(riders.length === 1 ? [riders[0].id] : []));

  if (state.success) {
    return (
      <div style={{ background: "#F3F2EE", border: "1px solid #E4E2DD", padding: "20px 22px" }}>
        <p style={{ fontWeight: 700, fontSize: 15 }}>
          {state.success.status === "confirmed" ? "You're in. Confirmation is on its way to your inbox." : "You're on the waitlist. We'll email you if a place opens."}
        </p>
      </div>
    );
  }

  if (riders.length === 0) {
    return (
      <div style={{ background: "#F3F2EE", border: "1px solid #E4E2DD", padding: "20px 22px", maxWidth: 420 }}>
        <p style={{ fontSize: 14, marginBottom: 12 }}>Add your child&apos;s details once, then booking is a single tap.</p>
        <Link href="/my-events/children/new" style={{ display: "inline-block", background: "#111111", color: "#FAFAF8", padding: "10px 20px", fontWeight: 700, fontSize: 13 }}>
          + Add a child
        </Link>
      </div>
    );
  }

  const full = spacesLeft === 0;

  return (
    <form action={formAction} style={{ maxWidth: 460, background: "#F3F2EE", border: "1px solid #E4E2DD", padding: "20px 22px" }}>
      <h2 className="disp" style={{ fontSize: 18, marginBottom: 4 }}>{full ? "Join the waitlist" : "Who's coming?"}</h2>
      {spacesLeft !== null && (
        <p className="mono" style={{ fontSize: 11, color: "#6B6B66", marginBottom: 14 }}>
          {full ? "FULL" : `${spacesLeft} SPACE${spacesLeft === 1 ? "" : "S"} LEFT`}
        </p>
      )}

      {riders.map((r) => {
        const assignment = assignments.find((a) => a.rider_id === r.id);
        const locked = !!assignment?.assigned_by;
        const lockedGroup = groups.find((g) => g.id === assignment?.group_id);
        return (
          <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid #E4E2DD", flexWrap: "wrap" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, flex: 1 }}>
              <input
                type="checkbox"
                name="rider_id"
                value={r.id}
                checked={ticked.has(r.id)}
                onChange={(e) =>
                  setTicked((prev) => {
                    const next = new Set(prev);
                    if (e.target.checked) next.add(r.id);
                    else next.delete(r.id);
                    return next;
                  })
                }
              />
              {r.name}
            </label>
            {groups.length > 0 &&
              (locked ? (
                <span className="mono" style={{ fontSize: 11.5, color: "#6B6B66" }}>{lockedGroup?.name ?? "Group set by coach"}</span>
              ) : (
                <select name={`group:${r.id}`} defaultValue={assignment?.group_id ?? ""} style={select} aria-label={`Group for ${r.name}`}>
                  <option value="">Group…</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}{g.description ? ` (${g.description})` : ""}
                    </option>
                  ))}
                </select>
              ))}
          </div>
        );
      })}

      <p style={{ fontSize: 12, color: "#6B6B66", margin: "10px 0 16px" }}>
        <Link href="/my-events/children/new">+ Add another child</Link>
        {groups.length > 0 && " · Not sure of the group? Pick your best guess and the coach will move them."}
      </p>

      <button
        type="submit"
        disabled={pending || ticked.size === 0}
        style={{ background: "#111111", color: "#FAFAF8", border: "none", padding: "12px 24px", fontWeight: 700, fontSize: 13.5, cursor: pending ? "default" : "pointer", opacity: pending || ticked.size === 0 ? 0.6 : 1 }}
      >
        {pending ? "Booking…" : full ? "Join waitlist" : "Book"}
      </button>
      {state.error && <p style={{ color: "#A13A2A", fontSize: 12.5, marginTop: 14 }}>{state.error}</p>}
    </form>
  );
}
```

In `app/events/[id]/page.tsx`, replace the `event.bookable ? (<SignupForm …/>)` branch so signed-in parents get the rider form:

```tsx
      {event.bookable ? (
        <div style={{ marginTop: 28 }}>
          {attendee ? (
            <RiderSignupForm
              eventId={event.id}
              spacesLeft={spacesLeft}
              riders={riders}
              groups={groups}
              assignments={assignments}
            />
          ) : (
            <>
              <SignupForm eventId={event.id} spacesLeft={spacesLeft} />
              <p style={{ fontSize: 12.5, color: "#6B6B66", marginTop: 10 }}>
                Booked before? <a href="/my-events/login">Sign in</a> to book with your saved children.
              </p>
            </>
          )}
        </div>
      ) : ( /* unchanged external-link branch */ )}
```

with, above the `return`:

```ts
  const attendee = event.bookable ? await getCurrentAttendee() : null;
  const spacesLeft = event.bookable ? await getEventSpacesLeft(event.id) : null;
  const riders = attendee ? await getMyRiders(attendee.id) : [];
  const groups = attendee && event.club_id ? await getClubGroups(event.club_id) : [];
  const assignments = attendee && event.club_id ? await getRiderGroupAssignments(riders.map((r) => r.id), event.club_id) : [];
```

The parent login always lands on `/my-events` after the magic link (`emailRedirectTo` is fixed to `next=/my-events` in `app/my-events/(public)/login/page.tsx`). Returning to the event afterwards is a manual click, and adding a `next` param is deliberately out of scope here.

- [ ] **Step 7: Verify**

Run: `npm test && npx tsc --noEmit && npm run lint && npx playwright test e2e/booking-form.spec.ts`
Expected: all pass (the existing guest-form test still sees no form on non-bookable events).

Manual (preview, as a test parent with two saved children, on a bookable Mid Devon test session with groups set up):
1. Tick both, pick Group 1 for one and Group 3 for the other, then Book. Expected: confirmed, and the email lists "(U10 · Group 1)" etc.
2. Book the same child again. Expected: "<name> is already booked on this session."
3. As a guest (signed out), book a different test event with a new child name, then sign in from the email link. Expected: that child appears under Children with "ADD A DATE OF BIRTH".

- [ ] **Step 8: Commit**

```bash
git add lib/riders/resolve-groups.ts lib/riders/resolve-groups.test.ts lib/actions/parse-rider-booking-form.ts lib/actions/parse-rider-booking-form.test.ts lib/actions/bookings.ts lib/actions/parse-booking-form.ts lib/data.ts lib/email/booking-confirmation.ts components/events/RiderSignupForm.tsx app/events
git commit -m "Book sessions with saved children, and remember guests' children"
```

---

### Task 7: Coach roster with groups and emergency details

**Files:**
- Modify: `lib/data.ts` (`EventBooking`, `getBookingsForEvent`; add `getStaffClubSessions`)
- Modify: `lib/csv.ts` (`bookingsToCsv`)
- Modify: `components/events/AttendeesList.tsx`
- Create: `lib/actions/rider-groups.ts`
- Modify: `app/organiser/events/[id]/attendees/page.tsx` (club-staff access)
- Modify: `lib/actions/bookings.ts` (`messageAttendees` club-staff access)
- Modify: `app/organiser/page.tsx` (sessions under "Your clubs")

**Interfaces:**
- Consumes: `canManageClub` (Task 5), `getClubGroups`.
- Produces:
  - `EventBookingPerson = { id: string; name: string; age_category: AgeCategory; riderId: string | null; groupId: string | null; groupName: string | null; medicalNotes: string | null; emergencyContactName: string | null; emergencyContactPhone: string | null; photoConsent: boolean | null }`
  - `EventBooking.people: EventBookingPerson[]` (replaces `Pick<BookingPersonRow, ...>[]`)
  - `assignRiderGroup(bookingPersonId: string, groupId: string): Promise<{ error?: string }>`
  - `getStaffClubSessions(clubIds: string[]): Promise<Pick<EventRow, "id" | "title" | "start_datetime" | "club_id">[]>` (upcoming bookable, next 60 days)
  - `<AttendeesList … groups={ClubGroupRow[]} canAssignGroups={boolean} />`

- [ ] **Step 1: Extend the bookings query**

Replace `EventBooking` and `getBookingsForEvent` in `lib/data.ts`:

```ts
export interface EventBookingPerson {
  id: string;
  name: string;
  age_category: AgeCategory;
  riderId: string | null;
  groupId: string | null;
  groupName: string | null;
  medicalNotes: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  photoConsent: boolean | null;
}

export interface EventBooking {
  id: string;
  status: SignupStatus;
  contactName: string | null;
  email: string;
  phone: string | null;
  people: EventBookingPerson[];
}

type RawPerson = {
  id: string;
  name: string;
  age_category: AgeCategory;
  rider_id: string | null;
  group_id: string | null;
  group: { name: string } | null;
  rider: Pick<RiderRow, "medical_notes" | "emergency_contact_name" | "emergency_contact_phone" | "photo_consent"> | null;
};

export async function getBookingsForEvent(eventId: string): Promise<EventBooking[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bookings")
    .select(
      "id, status, attendee:attendees(contact_name, email, phone), people:booking_people(id, name, age_category, rider_id, group_id, group:club_groups(name), rider:riders(medical_notes, emergency_contact_name, emergency_contact_phone, photo_consent))"
    )
    .eq("event_id", eventId)
    .neq("status", "cancelled")
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data as unknown as { id: string; status: SignupStatus; attendee: { contact_name: string | null; email: string; phone: string | null }; people: RawPerson[] }[]).map(
    (row) => ({
      id: row.id,
      status: row.status,
      contactName: row.attendee.contact_name,
      email: row.attendee.email,
      phone: row.attendee.phone,
      people: row.people.map((p) => ({
        id: p.id,
        name: p.name,
        age_category: p.age_category,
        riderId: p.rider_id,
        groupId: p.group_id,
        groupName: p.group?.name ?? null,
        medicalNotes: p.rider?.medical_notes ?? null,
        emergencyContactName: p.rider?.emergency_contact_name ?? null,
        emergencyContactPhone: p.rider?.emergency_contact_phone ?? null,
        photoConsent: p.rider?.photo_consent ?? null,
      })),
    })
  );
}

export async function getStaffClubSessions(clubIds: string[]): Promise<Pick<EventRow, "id" | "title" | "start_datetime" | "club_id">[]> {
  if (clubIds.length === 0) return [];
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const horizon = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("events")
    .select("id, title, start_datetime, club_id")
    .in("club_id", clubIds)
    .eq("bookable", true)
    .gte("start_datetime", today)
    .lte("start_datetime", horizon)
    .order("start_datetime", { ascending: true });
  if (error) throw error;
  return data as Pick<EventRow, "id" | "title" | "start_datetime" | "club_id">[];
}
```

(`riders` rows are only visible to the parent, admins, and club staff via RLS. For anyone else `rider` comes back null and those fields are null, which is the intended degradation.)

Update `bookingsToCsv` in `lib/csv.ts`:

```ts
export function bookingsToCsv(bookings: EventBooking[]): string {
  const headers = ["Contact name", "Contact email", "Contact phone", "Person name", "Age category", "Group", "Emergency contact", "Emergency phone", "Medical notes", "Photo consent", "Status"];
  const rows = bookings.flatMap((b) =>
    b.people.map((p) => [
      b.contactName ?? "",
      b.email,
      b.phone ?? "",
      p.name,
      p.age_category,
      p.groupName ?? "",
      p.emergencyContactName ?? "",
      p.emergencyContactPhone ?? "",
      p.medicalNotes ?? "",
      p.photoConsent === null ? "" : p.photoConsent ? "Yes" : "No",
      b.status,
    ])
  );
  return [headers, ...rows].map((row) => row.map(String).map(csvEscape).join(",")).join("\n");
}
```

- [ ] **Step 2: `assignRiderGroup`**

```ts
// lib/actions/rider-groups.ts
"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { canManageClub, getCurrentProfile } from "@/lib/auth";

// Coach moves a child into a group from the roster. Sets the rider's
// club-wide assignment (assigned_by = coach, so the parent can no longer
// change it) and this booking's own group_id so the roster updates now.
export async function assignRiderGroup(bookingPersonId: string, groupId: string): Promise<{ error?: string }> {
  const profile = await getCurrentProfile();
  const admin = createAdminClient();

  const { data: person } = await admin
    .from("booking_people")
    .select("rider_id, booking:bookings!inner(event_id, event:events!inner(club_id))")
    .eq("id", bookingPersonId)
    .single();
  const p = person as unknown as { rider_id: string | null; booking: { event_id: string; event: { club_id: string | null } } } | null;
  const clubId = p?.booking.event.club_id;
  if (!p || !clubId) return { error: "This session isn't linked to a club." };
  if (!(await canManageClub(profile, clubId))) return { error: "Not authorised for this club." };

  const { data: group } = await admin.from("club_groups").select("club_id").eq("id", groupId).single();
  if (!group || group.club_id !== clubId) return { error: "That group belongs to a different club." };

  if (p.rider_id) {
    const { error } = await admin.from("rider_club_groups").upsert({
      rider_id: p.rider_id,
      club_id: clubId,
      group_id: groupId,
      assigned_by: profile!.id,
      assigned_at: new Date().toISOString(),
    });
    if (error) return { error: error.message };
  }

  const { error } = await admin.from("booking_people").update({ group_id: groupId }).eq("id", bookingPersonId);
  if (error) return { error: error.message };

  revalidatePath(`/organiser/events/${p.booking.event_id}/attendees`);
  revalidatePath(`/admin/events/${p.booking.event_id}/attendees`);
  return {};
}
```

- [ ] **Step 3: Roster UI**

Rewrite `components/events/AttendeesList.tsx`. It now groups people by group and shows emergency details:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { downloadCsv, bookingsToCsv } from "@/lib/csv";
import { assignRiderGroup } from "@/lib/actions/rider-groups";
import type { EventBooking, EventBookingPerson } from "@/lib/data";
import type { ClubGroupRow } from "@/lib/supabase/types";

type Row = { booking: EventBooking; person: EventBookingPerson };

export default function AttendeesList({
  eventTitle,
  bookings,
  capacity,
  groups = [],
  canAssignGroups = false,
}: {
  eventTitle: string;
  bookings: EventBooking[];
  capacity: number | null;
  groups?: ClubGroupRow[];
  canAssignGroups?: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const confirmedCount = bookings.filter((b) => b.status === "confirmed").reduce((sum, b) => sum + b.people.length, 0);
  const waitlistedCount = bookings.filter((b) => b.status === "waitlisted").reduce((sum, b) => sum + b.people.length, 0);

  const rows: Row[] = bookings.flatMap((booking) => booking.people.map((person) => ({ booking, person })));
  const sections = groups.length > 0
    ? [...groups.map((g) => ({ key: g.id, title: g.name, rows: rows.filter((r) => r.person.groupId === g.id) })),
       { key: "none", title: "No group yet", rows: rows.filter((r) => !r.person.groupId || !groups.some((g) => g.id === r.person.groupId)) }]
    : [{ key: "all", title: "", rows }];

  async function move(personId: string, groupId: string) {
    const r = await assignRiderGroup(personId, groupId);
    if (r.error) setError(r.error);
    else router.refresh();
  }

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
      {error && <p style={{ color: "#A13A2A", fontSize: 12.5, marginBottom: 10 }}>{error}</p>}

      {rows.length === 0 ? (
        <p style={{ color: "#6B6B66", fontSize: 13.5 }}>No signups yet.</p>
      ) : (
        sections.filter((s) => s.rows.length > 0).map((s) => (
          <section key={s.key} style={{ marginBottom: 24 }}>
            {s.title && <h3 className="mono" style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", marginBottom: 6 }}>{s.title.toUpperCase()} · {s.rows.length}</h3>}
            <div style={{ borderTop: "2px solid #111111" }}>
              {s.rows.map(({ booking, person }) => (
                <div key={person.id} style={{ padding: "12px 6px", borderBottom: "1px solid #E4E2DD" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>
                      {person.name} <span className="mono" style={{ fontSize: 11, color: "#6B6B66", fontWeight: 400 }}>{person.age_category.toUpperCase()}{booking.status === "waitlisted" ? " · WAITLISTED" : ""}</span>
                    </div>
                    {canAssignGroups && groups.length > 0 && (
                      <select
                        value={person.groupId ?? ""}
                        onChange={(e) => move(person.id, e.target.value)}
                        style={{ border: "1px solid #D8D6D0", padding: "4px 6px", fontSize: 12 }}
                        aria-label={`Group for ${person.name}`}
                      >
                        <option value="" disabled>Move to…</option>
                        {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                      </select>
                    )}
                  </div>
                  <div className="mono" style={{ fontSize: 10.5, color: "#6B6B66", marginTop: 4 }}>
                    {booking.contactName ?? booking.email} · {booking.email}{booking.phone ? ` · ${booking.phone}` : ""}
                  </div>
                  {(person.emergencyContactName || person.medicalNotes || person.photoConsent === false) && (
                    <div style={{ fontSize: 12.5, color: "#4A4A46", marginTop: 6, lineHeight: 1.5 }}>
                      {person.emergencyContactName && <div>Emergency: {person.emergencyContactName} {person.emergencyContactPhone}</div>}
                      {person.medicalNotes && <div style={{ color: "#A13A2A" }}>Medical: {person.medicalNotes}</div>}
                      {person.photoConsent === false && <div>No photos</div>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
```

- [ ] **Step 4: Let club staff in**

In `app/organiser/events/[id]/attendees/page.tsx`, replace the ownership check with:

```ts
  const profile = await getCurrentProfile();
  const isClubStaff = event.club_id ? await canManageClub(profile, event.club_id) : false;
  if (!isAdminRole(profile) && event.created_by !== profile?.id && !isClubStaff) notFound();
  const groups = event.club_id ? await getClubGroups(event.club_id) : [];
```

and render `<AttendeesList eventTitle={event.title} bookings={bookings} capacity={event.booking_capacity} groups={groups} canAssignGroups={isClubStaff} />`. Make the same `groups`/`canAssignGroups` change on `app/admin/events/[id]/attendees/page.tsx` (admins: `canAssignGroups={!!event.club_id}`).

In `messageAttendees` (`lib/actions/bookings.ts`), widen the authorisation the same way. Select `club_id` too, and replace the `created_by` check with:

```ts
  const isClubStaff = event.club_id ? await canManageClub(profile, event.club_id) : false;
  if (!isAdminRole(profile) && event.created_by !== profile.id && !isClubStaff) return { error: "Not authorised." };
```

- [ ] **Step 5: Sessions under "Your clubs"**

In `app/organiser/page.tsx`, fetch `const sessions = await getStaffClubSessions(staffClubs.map((c) => c.id));` and under each club row in the panel from Task 5, list that club's sessions:

```tsx
              {sessions.filter((s) => s.club_id === c.id).slice(0, 8).map((s) => (
                <a key={s.id} href={`/organiser/events/${s.id}/attendees`} className="mono" style={{ display: "block", fontSize: 11.5, color: "#4A4A46", padding: "3px 0" }}>
                  {s.start_datetime.slice(0, 10)} · {s.title} → roster
                </a>
              ))}
```

(Restructure the panel row to a column so the sessions sit under the club name.)

- [ ] **Step 6: Verify**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: clean.

Manual (preview): as the Mid Devon coach (who did **not** create the session), open the roster from "Your clubs". Children appear under Group 1 / Group 3 with emergency contacts and medical notes. Move one to Group 2; the page refreshes with them under Group 2. Then as that child's parent, the event page shows the group as locked text instead of a select. Export CSV includes the new columns. A different organiser with no club link gets a 404 on the same roster URL.

- [ ] **Step 7: Commit**

```bash
git add lib/data.ts lib/csv.ts components/events/AttendeesList.tsx lib/actions/rider-groups.ts lib/actions/bookings.ts app/organiser app/admin/events
git commit -m "Show coaches a grouped roster with emergency details and let them move children between groups"
```

---

### Task 8: Docs and smoke test

**Files:**
- Create: `e2e/members-centre.spec.ts`
- Modify: `README.md`

- [ ] **Step 1: Write the e2e smoke test**

```ts
// e2e/members-centre.spec.ts
import { test, expect } from "@playwright/test";

// Same ceiling as the rest of e2e/: no authenticated sessions, no fixture
// writes. This only proves the members-centre routes are gated.
test.describe("Members centre gate", () => {
  for (const path of ["/my-events/children", "/my-events/children/new"]) {
    test(`${path} redirects signed-out visitors to the parent login`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/my-events\/login/);
    });
  }
});
```

Run: `npx playwright test e2e/members-centre.spec.ts`
Expected: PASS (4 tests: 2 paths × chromium + mobile).

- [ ] **Step 2: README**

In `README.md`:
- In "Project structure", under `my-events`, note that `(protected)/children/` is the members centre's saved-children section. Under `organiser/`, note `clubs/[id]/groups/` (club staff set groups and prices). Under `lib/`, add `riders/` (pure age-category and group-resolution logic, unit-tested) and `money.ts` (pence ⇄ pounds).
- In "Roles & auth", add a paragraph on **club staff**: `club_staff` links an organiser to a club, managed by admins on the club's edit page. `is_club_staff()` / `canManageClub()` gate groups, group assignment and session rosters for that club's events, regardless of who created the event.
- Add a "Members centre" section after "Event publishing paths": saved children (`riders`), DOB → British Cycling age category, groups and the "parent picks until a coach sets it" rule, guest bookings remembering children, and who can see medical/emergency data.
- In "Testing", add: `npm test` runs Vitest unit tests for pure `lib/` modules (`lib/**/*.test.ts`), which is where money and booking-rule logic gets tested.
- In "Event publishing paths" item 1, mention that the "Take signups on this site" section exists on both one-off and repeating forms, and that series edits/deletes refuse to remove dates that have bookings.

- [ ] **Step 3: Full check and commit**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build`
Expected: all succeed.

```bash
git add e2e/members-centre.spec.ts README.md
git commit -m "Document the members centre and gate-test its routes"
```

---

## After Plan 1

Push the branch to `preview` (`git push origin HEAD:preview`), apply `0027` if not already applied, and walk the Task 5–7 manual checks end to end with a real coach account before merging to `main`. Then start Plan 2 ([Stripe payments](2026-10-03-members-centre-2-stripe-payments.md)).
