# Club Training Calendar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move club training off the main South West Kids Cycling calendar and the default `.ics` feed, and surface it on the clubs page attached to the club that runs it.

**Architecture:** A new `kind` enum column (`race` | `training`) on `events`, `events_pending` and `event_series` partitions the existing event data — training stays a real event row so bookings and detail pages keep working. Every read path defaults to races; training is reached by explicitly asking for it. A new dependency-free module `lib/training.ts` derives the weekday pattern and next dates the clubs page shows.

**Tech Stack:** Next.js 16.3 (App Router, server components), React 19, TypeScript, Supabase Postgres, the `ics` package, Playwright for e2e, Node 22's built-in test runner for unit tests.

**Spec:** `docs/superpowers/specs/2026-09-12-club-training-calendar-design.md`

## Global Constraints

- Supabase project ref is `mpbptzacxbxadvwnqdol`. Apply DDL with the Supabase MCP `apply_migration` tool, and commit an identical copy of the SQL to `supabase/migrations/`.
- **The preview environment shares the production database.** Migrations and backfills are live from the moment they are applied.
- Never hardcode generated UUIDs in a migration — resolve clubs by `name` in a subquery.
- Every event in this app is all-day at midnight UTC. Do not introduce a time-of-day concept.
- `discipline` values are unchanged. Training rows keep `discipline = 'clusters'`.
- Feeds include training only when explicitly asked: `?kind=training`, `?kind=all`, or any request naming `discipline=clusters`. An unknown `kind` value degrades to races, matching how the existing filters degrade.
- Training requires a club. Enforced by DB constraint on `events` and `event_series`; `events_pending` is deliberately unconstrained.
- `lib/training.ts` and its test must use **relative imports only, no `@/` alias**, so `node --test` can run them without a bundler.
- The e2e suite runs against live data with no fixtures. Write assertions that hold whatever rows exist.
- Existing site palette: ground `#FAFAF8`, ink `#111111`, muted `#6B6B66`, rule `#E4E2DD`, accent `#E0102A`, training green `#1F5D3A` on `#EAF3EC`, caution `#946A0E` on `#FDF3E4` with border `#E9C98A`.
- Commit after every task. Branch is `worktree-club-training-calendar`.

---

## File Structure

**Created**

| File | Responsibility |
|---|---|
| `supabase/migrations/0022_event_kind.sql` | Enum, columns, backfill, constraints, index |
| `lib/training.ts` | Pure derivation: weekday pattern, next sessions, grouping. No imports. |
| `lib/training.test.ts` | Unit tests for the above, run by `node --test` |
| `components/clubs/ClubTrainingBand.tsx` | The per-club training band on `/clubs` |
| `components/TrainingThisWeek.tsx` | The "training this week" strip on the calendar |
| `e2e/training.spec.ts` | E2E for calendar exclusion, clubs page band, feed behaviour |

**Modified**

| File | Change |
|---|---|
| `lib/supabase/types.ts` | `EventKind`, `kind` on three row types, `training_note` on `ClubRow` |
| `lib/types.ts` | `kind` on `CalendarEvent`, `trainingNote` on `Club` |
| `lib/data.ts` | `getEvents(kind)`, `getTrainingByClub()`, map the new fields |
| `app/calendar.ics/route.ts` | `kind` filter, feed name |
| `app/page.tsx` | Pass training sessions to the calendar |
| `components/CalendarPage.tsx` | Races only, strip, hero copy |
| `components/ClubsPage.tsx` | Render the training band |
| `app/clubs/page.tsx` | Load training grouped by club |
| `app/embed/page.tsx` | `kind` param, races default |
| `components/SubscribeSelector.tsx` | Drop training chip, add club-training section |
| `components/EmbedBuilderPage.tsx` | Same option for embeds |
| `components/clubs/ClubFields.tsx`, `club-form-values.ts`, `lib/actions/parse-club-form.ts` | `training_note` field |
| `components/events/EventForm.tsx`, `SeriesForm.tsx`, `PendingEditPanel.tsx`, `SubmitEventForm.tsx` | Race/Training toggle |
| `lib/actions/parse-event-form.ts`, `parse-series-form.ts`, `parse-pending-form.ts`, `public-submit.ts` | Parse and validate `kind` |
| `lib/ingestion/extract-events.ts`, `app/api/mcp/route.ts`, `lib/actions/chat.ts` | Emit/describe `kind` |
| `tsconfig.json` | `allowImportingTsExtensions` |
| `package.json` | `test:unit` script |
| `README.md` | Document the split |

---

### Task 1: Migration and types

**Files:**
- Create: `supabase/migrations/0022_event_kind.sql`
- Modify: `lib/supabase/types.ts`, `lib/types.ts`, `lib/data.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `EventKind = "race" | "training"`; `EventRow.kind`, `EventPendingRow.kind`, `EventSeriesRow.kind` all `EventKind`; `ClubRow.training_note: string | null`; `CalendarEvent.kind: EventKind`; `Club.trainingNote: string | null`.

This task has no failing-test cycle — it is DDL. Verification is SQL run against the live project.

- [ ] **Step 1: Record the pre-migration baseline**

Run via the Supabase MCP `execute_sql` tool on project `mpbptzacxbxadvwnqdol`:

```sql
select count(*) filter (where discipline = 'clusters')                          as training,
       count(*) filter (where discipline = 'clusters' and club_id is null)      as orphans,
       count(*) filter (where discipline <> 'clusters'
                          and start_datetime >= current_date and approved)      as upcoming_races
from events;
```

Expected: `training = 47`, `orphans = 41`, `upcoming_races = 20`. If these differ, stop and report — the backfill below is written against these counts.

- [ ] **Step 2: Write the migration file**

Create `supabase/migrations/0022_event_kind.sql`:

```sql
-- Training is two thirds of the calendar (47 of 67 upcoming events) drawn
-- from five weekly programmes at three clubs. `kind` separates it from
-- races so the calendar and the default .ics feed can default to races,
-- while training stays a real event row — bookings, detail pages and
-- suggest-a-change all key on events.id and must keep working.
--
-- `discipline` is deliberately untouched: training rows keep 'clusters'.

create type event_kind as enum ('race', 'training');

alter table events         add column kind event_kind not null default 'race';
alter table events_pending add column kind event_kind not null default 'race';
alter table event_series   add column kind event_kind not null default 'race';

alter table clubs add column training_note text;

comment on column clubs.training_note is
  'Free-text detail the club owns: times, term-time caveats, who to contact '
  'before a first visit. No event row carries a time of day, so this is the '
  'only place session times can be stated.';

-- ---------- backfill: clusters means training ----------

update events         set kind = 'training' where discipline = 'clusters';
update events_pending set kind = 'training' where discipline = 'clusters';
update event_series   set kind = 'training' where discipline = 'clusters';

-- ---------- backfill: attach training to its club ----------
-- Explicit organiser_name matches rather than a fuzzy lookup, so the
-- migration is deterministic and reviewable. Clubs are resolved by name
-- (never by hardcoded uuid).

update events e set club_id = c.id
from clubs c
where e.kind = 'training' and e.club_id is null
  and c.name = 'Sulis Scorpions Youth Cycling Club'
  and e.organiser_name = 'Sulis Scorpions Youth CC';

update events e set club_id = c.id
from clubs c
where e.kind = 'training' and e.club_id is null
  and c.name = 'Wheal Velocity'
  and e.organiser_name in ('Wheal Velocity', 'Wheal Velocity Cycling Club');

update events e set club_id = c.id
from clubs c
where e.kind = 'training' and e.club_id is null
  and c.name = 'Mid Devon CC'
  and e.organiser_name = 'Mid Devon Cycling Club';

-- The same three, for the series that generate those occurrences.
update event_series s set club_id = c.id
from clubs c
where s.kind = 'training' and s.club_id is null
  and ((c.name = 'Sulis Scorpions Youth Cycling Club' and s.organiser_name = 'Sulis Scorpions Youth CC')
    or (c.name = 'Wheal Velocity' and s.organiser_name in ('Wheal Velocity', 'Wheal Velocity Cycling Club'))
    or (c.name = 'Mid Devon CC'   and s.organiser_name = 'Mid Devon Cycling Club'));

-- ---------- constraints, after the backfill so they cannot fail ----------
-- events_pending is deliberately left unconstrained: an ingested candidate
-- may legitimately arrive before anyone has identified its club, and the
-- pending queue is where a human attaches one before approval.

alter table events add constraint training_requires_club
  check (kind <> 'training' or club_id is not null);

alter table event_series add constraint series_training_requires_club
  check (kind <> 'training' or club_id is not null);

create index events_training_club_date_idx
  on events (club_id, start_datetime)
  where kind = 'training';
```

- [ ] **Step 3: Apply it**

Call the Supabase MCP `apply_migration` tool with `project_id: "mpbptzacxbxadvwnqdol"`, `name: "event_kind"`, and the file's SQL as `query`.

- [ ] **Step 4: Verify the backfill**

Run via `execute_sql`:

```sql
select (select count(*) from events where kind = 'training')                     as training,
       (select count(*) from events where kind = 'training' and club_id is null) as orphans,
       (select count(*) from events
         where kind = 'race' and approved and start_datetime >= current_date)     as upcoming_races,
       (select count(*) from event_series where kind = 'training' and club_id is null) as orphan_series;
```

Expected: `training = 47`, `orphans = 0`, `upcoming_races = 20`, `orphan_series = 0`.

Then confirm the per-club split:

```sql
select c.name, count(*) from events e join clubs c on c.id = e.club_id
where e.kind = 'training' group by c.name order by count(*) desc;
```

Expected: Wheal Velocity 19, Sulis Scorpions Youth Cycling Club 15, Mid Devon CC 13.

**If `orphans` is not 0, stop.** The constraint would have rejected the migration, so a non-zero count means the migration did not apply as written.

- [ ] **Step 5: Update the TypeScript row types**

In `lib/supabase/types.ts`, add the enum beside the other enums near the top:

```ts
// Races vs club training. Training also keeps discipline 'clusters' — kind
// is what every read path filters on; discipline stayed put to avoid churn.
export type EventKind = "race" | "training";
```

Add `kind: EventKind;` to `EventRow` (beside `discipline`), to `EventSeriesRow` (beside `discipline`), and to `EventPendingRow` (beside `discipline`). Add to `ClubRow`, after `summary`:

```ts
  training_note: string | null;
```

- [ ] **Step 6: Update the domain types**

In `lib/types.ts`, add to the imports/definitions:

```ts
export type EventKind = "race" | "training";
```

Add `kind: EventKind;` to `CalendarEvent` (after `discipline`), and `trainingNote: string | null;` to `Club` (after `summary`).

- [ ] **Step 7: Map the new fields**

In `lib/data.ts`, add to `toCalendarEvent`, after the `discipline` line:

```ts
    kind: row.kind,
```

and to `toClub`, after `summary`:

```ts
    trainingNote: row.training_note,
```

- [ ] **Step 8: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS. (If a consumer of `CalendarEvent` or `Club` constructs one literally — check `lib/mock-data.ts` — add the new fields there too.)

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/0022_event_kind.sql lib/supabase/types.ts lib/types.ts lib/data.ts
git commit -m "Separate club training from races with an events.kind column"
```

---

### Task 2: The derivation module

**Files:**
- Create: `lib/training.ts`, `lib/training.test.ts`
- Modify: `tsconfig.json`, `package.json`

**Interfaces:**
- Consumes: nothing (deliberately dependency-free).
- Produces:
  - `interface TrainingSession { id: string; title: string; date: string; venue: string; clubId: string }`
  - `weekdayPattern(sessions: TrainingSession[]): string | null`
  - `nextSessions(sessions: TrainingSession[], today: string, n: number): TrainingSession[]`
  - `groupByClub(sessions: TrainingSession[]): Map<string, TrainingSession[]>`
  - `sessionsInNextDays(sessions: TrainingSession[], today: string, days: number): TrainingSession[]`

- [ ] **Step 1: Enable `.ts` import specifiers**

In `tsconfig.json`, add to `compilerOptions` (valid because `noEmit` is already true):

```json
    "allowImportingTsExtensions": true,
```

- [ ] **Step 2: Add the unit test script**

In `package.json`, add to `scripts`:

```json
    "test:unit": "node --test --experimental-strip-types lib/*.test.ts",
```

- [ ] **Step 3: Write the failing test**

Create `lib/training.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { weekdayPattern, nextSessions, groupByClub, sessionsInNextDays } from "./training.ts";

const s = (id: string, date: string, clubId = "club-a") => ({
  id,
  title: "Junior Academy",
  date,
  venue: "Wheal Jane",
  clubId,
});

// 2026-09-12, -19 and -26 are Saturdays; 2026-09-17 is a Thursday.

test("weekdayPattern names a single weekday", () => {
  assert.equal(weekdayPattern([s("1", "2026-09-12"), s("2", "2026-09-19")]), "Saturdays");
});

test("weekdayPattern joins two weekdays in week order", () => {
  assert.equal(
    weekdayPattern([s("1", "2026-09-19"), s("2", "2026-09-17")]),
    "Thursdays & Saturdays"
  );
});

test("weekdayPattern returns null for irregular dates", () => {
  assert.equal(
    weekdayPattern([s("1", "2026-09-14"), s("2", "2026-09-16"), s("3", "2026-09-19")]),
    null
  );
});

test("weekdayPattern returns null for an empty list", () => {
  assert.equal(weekdayPattern([]), null);
});

test("nextSessions returns the soonest n in date order", () => {
  const out = nextSessions(
    [s("c", "2026-09-26"), s("a", "2026-09-12"), s("b", "2026-09-19")],
    "2026-09-10",
    2
  );
  assert.deepEqual(out.map((x) => x.id), ["a", "b"]);
});

test("nextSessions includes a session dated today", () => {
  const out = nextSessions([s("a", "2026-09-12")], "2026-09-12", 3);
  assert.deepEqual(out.map((x) => x.id), ["a"]);
});

test("nextSessions returns an empty list when nothing is upcoming", () => {
  assert.deepEqual(nextSessions([s("a", "2026-09-01")], "2026-09-12", 3), []);
});

test("groupByClub keys sessions by club id", () => {
  const grouped = groupByClub([s("a", "2026-09-12", "x"), s("b", "2026-09-19", "y"), s("c", "2026-09-26", "x")]);
  assert.deepEqual(grouped.get("x")?.map((v) => v.id), ["a", "c"]);
  assert.deepEqual(grouped.get("y")?.map((v) => v.id), ["b"]);
});

test("sessionsInNextDays covers today through the last day inclusive", () => {
  const out = sessionsInNextDays(
    [s("today", "2026-09-12"), s("last", "2026-09-18"), s("past", "2026-09-11"), s("after", "2026-09-19")],
    "2026-09-12",
    7
  );
  assert.deepEqual(out.map((x) => x.id), ["today", "last"]);
});
```

- [ ] **Step 4: Run it to make sure it fails**

Run: `npm run test:unit`
Expected: FAIL — `Cannot find module './training.ts'`.

- [ ] **Step 5: Write the implementation**

Create `lib/training.ts`:

```ts
// Pure derivation for club training. Deliberately imports nothing — not even
// the `@/` alias — so `node --test --experimental-strip-types` can run
// lib/training.test.ts directly, with no bundler in the loop. The small
// isoWeekdayOf helper is duplicated from lib/recurrence.ts for that reason.

export interface TrainingSession {
  id: string;
  title: string;
  /** YYYY-MM-DD */
  date: string;
  venue: string;
  clubId: string;
}

const WEEKDAY_NAMES = [
  "Mondays",
  "Tuesdays",
  "Wednesdays",
  "Thursdays",
  "Fridays",
  "Saturdays",
  "Sundays",
];

// 1 = Monday .. 7 = Sunday, matching event_series.weekdays.
function isoWeekdayOf(date: string): number {
  const jsDay = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  return jsDay === 0 ? 7 : jsDay;
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// "Saturdays", or "Thursdays & Saturdays" — and null the moment the dates
// stop forming a weekly pattern. Returning null matters: the clubs page
// falls back to listing dates rather than asserting a rhythm that isn't
// there, which is the whole point of treating training as a hint.
export function weekdayPattern(sessions: TrainingSession[]): string | null {
  if (sessions.length === 0) return null;
  const days = new Set(sessions.map((s) => isoWeekdayOf(s.date)));
  if (days.size > 2) return null;
  return [...days]
    .sort((a, b) => a - b)
    .map((d) => WEEKDAY_NAMES[d - 1])
    .join(" & ");
}

// A session dated today still counts as upcoming — someone checking on a
// Saturday morning should see that morning's session, not next week's.
export function nextSessions(
  sessions: TrainingSession[],
  today: string,
  n: number
): TrainingSession[] {
  return sessions
    .filter((s) => s.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, n);
}

export function groupByClub(sessions: TrainingSession[]): Map<string, TrainingSession[]> {
  const grouped = new Map<string, TrainingSession[]>();
  for (const s of sessions) {
    const existing = grouped.get(s.clubId);
    if (existing) existing.push(s);
    else grouped.set(s.clubId, [s]);
  }
  for (const list of grouped.values()) list.sort((a, b) => a.date.localeCompare(b.date));
  return grouped;
}

// `days` counts today as day one, so days = 7 ends six days from now.
export function sessionsInNextDays(
  sessions: TrainingSession[],
  today: string,
  days: number
): TrainingSession[] {
  const last = addDays(today, days - 1);
  return sessions
    .filter((s) => s.date >= today && s.date <= last)
    .sort((a, b) => a.date.localeCompare(b.date));
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm run test:unit`
Expected: PASS — 9 tests, 0 failures.

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add lib/training.ts lib/training.test.ts tsconfig.json package.json
git commit -m "Derive training weekday patterns and next sessions"
```

---

### Task 3: Feed defaults to races

**Files:**
- Modify: `app/calendar.ics/route.ts`
- Test: `e2e/training.spec.ts` (create)

**Interfaces:**
- Consumes: `EventKind` from Task 1.
- Produces: `KindFilter = "race" | "training" | "all"` and `parseKind(searchParams, disciplines)` inside the route (not exported — exercised over HTTP).

- [ ] **Step 1: Write the failing test**

Create `e2e/training.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

// The suite runs against live data with no fixtures, so these assert on the
// feed's shape and filtering rules rather than on specific events.

test.describe("calendar.ics training filtering", () => {
  test("the default feed contains no training sessions", async ({ request }) => {
    const res = await request.get("/calendar.ics");
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toContain("BEGIN:VCALENDAR");
    expect(body).not.toContain("Discipline: CLUSTERS");
  });

  test("?kind=training returns training and names the feed for it", async ({ request }) => {
    const res = await request.get("/calendar.ics?kind=training");
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toContain("X-WR-CALNAME:South West Kids Cycling — Club training");
    expect(body).toContain("Discipline: CLUSTERS");
  });

  test("?kind=all returns both races and training", async ({ request }) => {
    const body = await (await request.get("/calendar.ics?kind=all")).text();
    expect(body).toContain("Discipline: CLUSTERS");
    const races = body.match(/Discipline: (?!CLUSTERS)[A-Z]+/g) ?? [];
    expect(races.length).toBeGreaterThan(0);
  });

  test("an existing ?discipline=clusters subscription still delivers training", async ({ request }) => {
    const body = await (await request.get("/calendar.ics?discipline=clusters")).text();
    expect(body).toContain("Discipline: CLUSTERS");
  });

  test("an unknown kind degrades to races rather than erroring", async ({ request }) => {
    const res = await request.get("/calendar.ics?kind=banana");
    expect(res.status()).toBe(200);
    expect(await res.text()).not.toContain("Discipline: CLUSTERS");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx playwright test e2e/training.spec.ts --project=chromium`
Expected: FAIL — the default feed still contains `Discipline: CLUSTERS`, and the `?kind=training` feed name is missing.

- [ ] **Step 3: Add kind parsing to the route**

In `app/calendar.ics/route.ts`, add below the `UUID_RE` constant:

```ts
export type KindFilter = "race" | "training" | "all";

// Races by default. Training reaches a subscriber only when they ask for it
// — and naming discipline=clusters counts as asking, so the training-only
// subscriptions people already hold keep delivering instead of silently
// emptying. A calendar that goes blank reads as a bug to its owner and is
// invisible to us.
function parseKind(searchParams: URLSearchParams, disciplines: DisciplineType[]): KindFilter {
  const raw = searchParams.get("kind");
  if (raw === "training" || raw === "all" || raw === "race") return raw;
  if (disciplines.includes("clusters")) return "all";
  return "race";
}
```

Add `EventKind` to the type import from `@/lib/supabase/types`.

- [ ] **Step 4: Use it in `parseFilters` and `GET`**

Change `parseFilters` to return the kind alongside the rest — replace its `return` with:

```ts
  const kind = parseKind(searchParams, disciplines);
  return { disciplines, regions, clubs, kind };
```

In `GET`, change the destructuring and add the filter:

```ts
  const { disciplines, regions, clubs, kind } = parseFilters(request.nextUrl.searchParams);

  const supabase = await createClient();
  let query = supabase.from("events").select("*").eq("approved", true).neq("status", "cancelled");
  if (kind !== "all") query = query.eq("kind", kind satisfies EventKind);
  if (disciplines.length) query = query.in("discipline", disciplines);
```

(leave the region and club filters as they are).

- [ ] **Step 5: Name the feed**

Change the `feedName` signature and its `parts` array:

```ts
function feedName(
  disciplines: DisciplineType[],
  regions: RegionType[],
  clubNames: string[],
  kind: KindFilter
): string {
  const parts = [
    clubNames.length ? clubNames.join("/") : null,
    kind === "training" ? "Club training" : null,
    disciplines.length ? disciplines.map((d) => DISCIPLINE_LABELS[d]).join("/") : null,
    regions.length ? regions.map((r) => REGION_LABELS[r]).join("/") : null,
  ].filter(Boolean);
  return parts.length ? `South West Kids Cycling — ${parts.join(", ")}` : "South West Kids Cycling";
}
```

and update its call site to pass `kind`.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx playwright test e2e/training.spec.ts --project=chromium`
Expected: PASS — 5 tests.

- [ ] **Step 7: Run the full suite for regressions**

Run: `npx playwright test --project=chromium`
Expected: PASS — the existing `calendar.ics feed` tests in `e2e/subscribe.spec.ts` still pass, because `?discipline=cx&region=devon` is unaffected and `?club=not-a-uuid` still yields the plain feed name.

- [ ] **Step 8: Commit**

```bash
git add app/calendar.ics/route.ts e2e/training.spec.ts
git commit -m "Default the calendar feed to races, with training on request"
```

---

### Task 4: Calendar page shows races only

**Files:**
- Modify: `lib/data.ts`, `components/CalendarPage.tsx`, `app/page.tsx`, `app/embed/page.tsx`
- Test: `e2e/training.spec.ts`

**Interfaces:**
- Consumes: `CalendarEvent.kind` (Task 1).
- Produces: `getEvents(kind?: "race" | "training" | "all"): Promise<CalendarEvent[]>`, defaulting to `"race"`.

- [ ] **Step 1: Write the failing test**

Append to `e2e/training.spec.ts`:

```ts
test.describe("Calendar page", () => {
  test("shows no training sessions", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator("main").getByText("TRAINING SESSION")).toHaveCount(0);
  });

  test("the discipline filters offer no training chip", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Toggle filters" }).click();
    await expect(page.getByRole("button", { name: "Training session" })).toHaveCount(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx playwright test e2e/training.spec.ts --project=chromium -g "Calendar page"`
Expected: FAIL — training sessions and their chip are still on the page.

- [ ] **Step 3: Add the kind filter to `getEvents`**

In `lib/data.ts`, replace `getEvents`:

```ts
// Races by default — every current caller (the calendar, the embed, the
// structured data) wants races. Training is opt-in, the same rule the .ics
// feed follows.
export async function getEvents(kind: "race" | "training" | "all" = "race"): Promise<CalendarEvent[]> {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  let query = supabase
    .from("events")
    .select("*")
    .gte("start_datetime", today)
    .order("start_datetime", { ascending: true });

  if (kind !== "all") query = query.eq("kind", kind);

  const { data, error } = await query;

  if (error) throw error;
  return (data as EventRow[]).map(toCalendarEvent);
}
```

- [ ] **Step 4: Update the hero copy**

In `components/CalendarPage.tsx`, replace the standfirst paragraph text (currently "Every Under 8s–16s race and training session from Exeter and Plymouth to Cornwall and Somerset — Cross Country mountain biking, cyclocross, road, triathlon in one calendar.") with:

```tsx
          Every Under 8s–16s race from Exeter and Plymouth to Cornwall and Somerset — Cross Country mountain biking, cyclocross, road and triathlon in one calendar. Club training lives on the <Link href="/clubs" style={{ borderBottom: "1px solid #111111" }}>clubs page</Link>.
```

- [ ] **Step 5: Give the embed the same default**

In `app/embed/page.tsx`, change the `searchParams` type to add `kind?: string`, destructure it, and pass it through:

```tsx
  const { region, discipline, club, limit, kind } = await searchParams;
  const kindFilter = kind === "training" || kind === "all" ? kind : "race";
  const events = await getEvents(kindFilter);
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx playwright test e2e/training.spec.ts --project=chromium`
Expected: PASS — 7 tests.

- [ ] **Step 7: Run the full suite**

Run: `npx playwright test --project=chromium`
Expected: PASS. `e2e/calendar.spec.ts` asserts on events generally, not on training specifically.

- [ ] **Step 8: Commit**

```bash
git add lib/data.ts components/CalendarPage.tsx app/embed/page.tsx e2e/training.spec.ts
git commit -m "Show races only on the calendar and the embed"
```

---

### Task 5: Training-this-week strip

**Files:**
- Create: `components/TrainingThisWeek.tsx`
- Modify: `lib/data.ts`, `app/page.tsx`, `components/CalendarPage.tsx`

**Interfaces:**
- Consumes: `sessionsInNextDays`, `groupByClub`, `TrainingSession` (Task 2); `getEvents` (Task 4).
- Produces: `getUpcomingTraining(): Promise<TrainingSession[]>` in `lib/data.ts`; `<TrainingThisWeek sessions={…} clubs={…} />`.

- [ ] **Step 1: Write the failing test**

Append to `e2e/training.spec.ts`:

```ts
test.describe("Training this week strip", () => {
  test("either lists sessions with a link to the clubs page, or is absent", async ({ page }) => {
    await page.goto("/");
    const strip = page.getByTestId("training-this-week");
    // Renders nothing in a week with no sessions — a quiet week should look
    // quiet rather than broken — so both states are valid.
    if (await strip.count()) {
      await expect(strip.getByRole("link", { name: /all club training/i })).toBeVisible();
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx playwright test e2e/training.spec.ts --project=chromium -g "Training this week"`
Expected: FAIL — `getByTestId` throws because the component does not exist yet and `strip.count()` resolves 0, so the test passes vacuously. **Add a temporary assertion `expect(await strip.count()).toBeGreaterThan(0)` to see it fail, then remove it before Step 6.**

- [ ] **Step 3: Add the data loader**

In `lib/data.ts`, add after `getEvents`:

```ts
import type { TrainingSession } from "@/lib/training";

// Upcoming training as the shape lib/training.ts works in. Rows without a
// club are dropped — the DB constraint makes that impossible for new data,
// and a clubless session has nowhere to appear anyway.
export async function getUpcomingTraining(): Promise<TrainingSession[]> {
  const events = await getEvents("training");
  return events
    .filter((e): e is CalendarEvent & { clubId: string } => e.clubId !== null)
    .map((e) => ({ id: e.id, title: e.title, date: e.date, venue: e.venue, clubId: e.clubId }));
}
```

- [ ] **Step 4: Write the component**

Create `components/TrainingThisWeek.tsx`:

```tsx
import Link from "next/link";
import { sessionsInNextDays, groupByClub, type TrainingSession } from "@/lib/training";
import { fmtDay } from "@/lib/format";
import type { Club } from "@/lib/types";

// Renders nothing when the coming week is empty. A strip saying "no training
// this week" would be a worse answer than no strip at all — it draws the eye
// to an absence rather than letting the calendar get on with its job.
export default function TrainingThisWeek({
  sessions,
  clubs,
}: {
  sessions: TrainingSession[];
  clubs: Club[];
}) {
  const today = new Date().toISOString().slice(0, 10);
  const thisWeek = sessionsInNextDays(sessions, today, 7);
  if (thisWeek.length === 0) return null;

  const clubName = new Map(clubs.map((c) => [c.id, c.name]));
  const byClub = [...groupByClub(thisWeek).entries()];

  return (
    <div
      data-testid="training-this-week"
      style={{ border: "1px solid #E4E2DD", background: "#FFFFFF", padding: "14px 16px", marginTop: 26, maxWidth: 560 }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <span className="mono" style={{ fontSize: 10.5, letterSpacing: "0.08em", color: "#1F5D3A", fontWeight: 700 }}>
          CLUB TRAINING THIS WEEK
        </span>
        <Link href="/clubs" style={{ fontSize: 11.5, fontWeight: 700, color: "#111111", borderBottom: "1px solid #111111", paddingBottom: 1 }}>
          All club training
        </Link>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 11 }}>
        {byClub.map(([clubId, list]) => (
          <div key={clubId} style={{ fontSize: 12.5, color: "#4A4A46", lineHeight: 1.5 }}>
            <Link href={`/clubs#club-${clubId}`} style={{ fontWeight: 700, color: "#111111" }}>
              {clubName.get(clubId) ?? "Club"}
            </Link>
            {" — "}
            {list.map((s) => `${fmtDay(s.date).day} ${fmtDay(s.date).mon}`).join(", ")}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Wire it in**

In `app/page.tsx`, load training alongside the rest and pass it down:

```tsx
import { getClubs, getEvents, getUpcomingTraining } from "@/lib/data";

  const [events, profile, clubs, training] = await Promise.all([
    getEvents(),
    getCurrentProfile(),
    getClubs(),
    getUpcomingTraining(),
  ]);
```

and:

```tsx
      <CalendarPage events={events} clubs={clubs} training={training} isAdmin={isAdminRole(profile)} />
```

In `components/CalendarPage.tsx`, add the import, extend the props, and render the strip directly after the subscribe CTA block inside `<header>`:

```tsx
import TrainingThisWeek from "@/components/TrainingThisWeek";
import type { TrainingSession } from "@/lib/training";
```

```tsx
export default function CalendarPage({ events, clubs = [], training = [], isAdmin = false }: { events: CalendarEvent[]; clubs?: Club[]; training?: TrainingSession[]; isAdmin?: boolean }) {
```

```tsx
        <TrainingThisWeek sessions={training} clubs={clubs} />
```

- [ ] **Step 6: Run the tests to verify they pass**

Remove the temporary assertion from Step 2 first.
Run: `npx playwright test e2e/training.spec.ts --project=chromium`
Expected: PASS — 8 tests.

- [ ] **Step 7: Verify the strip actually renders**

Run: `npx playwright test e2e/training.spec.ts --project=chromium -g "Training this week" --debug` is **not** needed. Instead confirm with data:

Run via the Supabase MCP `execute_sql`:

```sql
select count(*) from events
where kind = 'training' and approved
  and start_datetime >= current_date
  and start_datetime < current_date + 7;
```

If this is greater than 0, the strip must be visible on `/`. Load `http://localhost:3000` in the Browser pane and confirm it is.

- [ ] **Step 8: Commit**

```bash
git add components/TrainingThisWeek.tsx lib/data.ts app/page.tsx components/CalendarPage.tsx e2e/training.spec.ts
git commit -m "Add a training-this-week strip to the calendar"
```

---

### Task 6: Training band on the clubs page

**Files:**
- Create: `components/clubs/ClubTrainingBand.tsx`
- Modify: `components/ClubsPage.tsx`, `app/clubs/page.tsx`
- Test: `e2e/training.spec.ts`

**Interfaces:**
- Consumes: `weekdayPattern`, `nextSessions`, `groupByClub`, `TrainingSession` (Task 2); `getUpcomingTraining` (Task 5); `Club.trainingNote` (Task 1).
- Produces: `<ClubTrainingBand club={…} sessions={…} />`.

- [ ] **Step 1: Write the failing test**

Append to `e2e/training.spec.ts`:

```ts
test.describe("Clubs page training", () => {
  test("a club that trains shows its next session and a subscribe link", async ({ page }) => {
    await page.goto("/clubs");
    const band = page.getByTestId("club-training").first();
    await expect(band).toBeVisible();
    await expect(band).toContainText(/Next:/);
    const feed = band.getByRole("link", { name: /add this club's training/i });
    await expect(feed).toHaveAttribute("href", /\/calendar\.ics\?club=[0-9a-f-]{36}&kind=training/);
  });

  test("a club with no training listed is prompted for", async ({ page }) => {
    await page.goto("/clubs");
    await expect(page.getByText("No training sessions listed").first()).toBeVisible();
  });

  test("each club row carries an anchor the calendar strip can target", async ({ page }) => {
    await page.goto("/clubs");
    await expect(page.locator('main [id^="club-"]').first()).toBeAttached();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx playwright test e2e/training.spec.ts --project=chromium -g "Clubs page training"`
Expected: FAIL — no `club-training` test id exists.

- [ ] **Step 3: Write the band**

Create `components/clubs/ClubTrainingBand.tsx`:

```tsx
"use client";

import { weekdayPattern, nextSessions, type TrainingSession } from "@/lib/training";
import { fmtDay } from "@/lib/format";
import { trackEvent } from "@/lib/analytics";
import type { Club } from "@/lib/types";

const GREEN = "#1F5D3A";

function dateLabel(date: string) {
  const f = fmtDay(date);
  return `${f.dow} ${f.day} ${f.mon}`;
}

export default function ClubTrainingBand({ club, sessions }: { club: Club; sessions: TrainingSession[] }) {
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = nextSessions(sessions, today, 3);

  if (upcoming.length === 0) {
    return (
      <div style={{ fontSize: 12, color: "#6B6B66", marginTop: 9 }}>
        No training sessions listed —{" "}
        <a href="/submit-event" style={{ color: "#6B6B66", textDecoration: "underline", textUnderlineOffset: 2 }}>
          tell us about theirs
        </a>
      </div>
    );
  }

  const pattern = weekdayPattern(upcoming);
  const [next, ...rest] = upcoming;
  const feedUrl = `/calendar.ics?club=${club.id}&kind=training`;

  return (
    <div
      data-testid="club-training"
      style={{ background: "#EAF3EC", borderLeft: `3px solid ${GREEN}`, padding: "8px 10px", marginTop: 9, fontSize: 12.5, color: GREEN, lineHeight: 1.55 }}
    >
      <span style={{ fontWeight: 700 }}>{pattern ? `Trains ${pattern}` : "Training sessions"}</span>
      {next.venue ? ` · ${next.venue}` : ""}
      {club.trainingNote && <div style={{ marginTop: 4 }}>{club.trainingNote}</div>}
      <div style={{ marginTop: 4 }}>
        Next: <strong>{dateLabel(next.date)}</strong>
        {rest.length > 0 && ` · then ${rest.map((s) => `${fmtDay(s.date).day} ${fmtDay(s.date).mon}`).join(", ")}`}
      </div>
      <a
        href={feedUrl}
        onClick={() => trackEvent("club_training_subscribe", { club_id: club.id, club_name: club.name })}
        style={{ display: "inline-block", marginTop: 6, fontSize: 11.5, fontWeight: 700, color: GREEN, borderBottom: `1px solid ${GREEN}`, paddingBottom: 1 }}
      >
        Add this club&apos;s training to my calendar
      </a>
    </div>
  );
}
```

**Check `lib/format.ts` first:** if `fmtDay` does not return a `dow` field, add one there returning the short weekday name (`"Sat"`), or build it in `dateLabel` with `new Date(\`${date}T00:00:00.000Z\`).toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" })`.

- [ ] **Step 4: Render it, with an anchor**

In `components/ClubsPage.tsx`, add the props and imports:

```tsx
import ClubTrainingBand from "@/components/clubs/ClubTrainingBand";
import { groupByClub, type TrainingSession } from "@/lib/training";
```

```tsx
export default function ClubsPage({ clubs, training = [] }: { clubs: Club[]; training?: TrainingSession[] }) {
```

Inside the component, before `return`:

```tsx
  const trainingByClub = useMemo(() => groupByClub(training), [training]);
```

On the club row `<div key={c.id} className="row-hover" …>`, add `id={\`club-${c.id}\`}`, and directly after the club's `<p>` summary paragraph add:

```tsx
                  <ClubTrainingBand club={c} sessions={trainingByClub.get(c.id) ?? []} />
```

Add a caveat under the page's standfirst paragraph in the header:

```tsx
        <p style={{ maxWidth: 480, fontSize: 13, lineHeight: 1.6, color: "#946A0E", background: "#FDF3E4", border: "1px solid #E9C98A", padding: "10px 12px", marginTop: 16 }}>
          Training times can change at short notice — always check with the club before turning up.
        </p>
```

- [ ] **Step 5: Load the data**

In `app/clubs/page.tsx`:

```tsx
import ClubsPage from "@/components/ClubsPage";
import { getClubs, getUpcomingTraining } from "@/lib/data";

export default async function Page() {
  const [clubs, training] = await Promise.all([getClubs(), getUpcomingTraining()]);
  return <ClubsPage clubs={clubs} training={training} />;
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx playwright test e2e/training.spec.ts --project=chromium`
Expected: PASS — 11 tests.

- [ ] **Step 7: Run the full suite**

Run: `npx playwright test --project=chromium`
Expected: PASS — including the existing `e2e/clubs.spec.ts`.

- [ ] **Step 8: Commit**

```bash
git add components/clubs/ClubTrainingBand.tsx components/ClubsPage.tsx app/clubs/page.tsx e2e/training.spec.ts
git commit -m "Show each club's next training session on the clubs page"
```

---

### Task 7: Editable training note

**Files:**
- Modify: `components/clubs/ClubFields.tsx`, `components/clubs/club-form-values.ts`, `lib/actions/parse-club-form.ts`

**Interfaces:**
- Consumes: `ClubRow.training_note` (Task 1), `Club.trainingNote` (Task 1).
- Produces: `ClubFieldValues.trainingNote: string`; `ClubFormValues` gains `training_note`.

- [ ] **Step 1: Add it to the form values**

In `components/clubs/club-form-values.ts`, add `trainingNote: string;` to `ClubFieldValues`, `trainingNote: club?.trainingNote ?? "",` to `clubToValues`, and to `clubValuesToFormData`:

```ts
  formData.set("training_note", values.trainingNote);
```

- [ ] **Step 2: Parse it**

In `lib/actions/parse-club-form.ts`, add `"training_note"` to the `Pick<ClubRow, …>` union, then:

```ts
  const trainingNote = String(formData.get("training_note") ?? "").trim() || null;
```

and `training_note: trainingNote,` in the returned `values`.

- [ ] **Step 3: Add the field**

In `components/clubs/ClubFields.tsx`, add a textarea directly after the `summary` one, following the same markup:

```tsx
      <div style={field}>
        <label style={label}>TRAINING NOTE</label>
        <textarea
          style={{ ...input, minHeight: 64 }}
          name={withNames ? "training_note" : undefined}
          value={values.trainingNote}
          onChange={(e) => onChange("trainingNote", e.target.value)}
          placeholder="e.g. Junior Academy, Saturdays 10:00–11:30 at Wheal Jane, term time only — message Dave before a first visit."
        />
        <p style={{ fontSize: 11, color: "#6B6B66", marginTop: 5 }}>
          Shown on the clubs page beside the next session. Session times live here, because event rows carry a date but no time.
        </p>
      </div>
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Verify end to end**

Start the dev server in the Browser pane, sign in is not required for the check — confirm `npx playwright test --project=chromium` still passes (37 + 11 tests), then load `/clubs` and confirm a club with a `training_note` set renders it. Set one for testing via the Supabase MCP:

```sql
update clubs set training_note = 'Junior Academy, Saturdays 10:00–11:30 at Wheal Jane, term time only.'
where name = 'Wheal Velocity';
```

- [ ] **Step 6: Commit**

```bash
git add components/clubs/ClubFields.tsx components/clubs/club-form-values.ts lib/actions/parse-club-form.ts
git commit -m "Let a club describe its training in its own words"
```

---

### Task 8: Race/Training toggle in the authoring forms

**Files:**
- Modify: `components/events/EventForm.tsx`, `components/events/SeriesForm.tsx`, `components/events/PendingEditPanel.tsx`, `components/events/SubmitEventForm.tsx`, `lib/actions/parse-event-form.ts`, `lib/actions/parse-series-form.ts`, `lib/actions/parse-pending-form.ts`, `lib/actions/public-submit.ts`

**Interfaces:**
- Consumes: `EventKind` (Task 1).
- Produces: form field `name="kind"` with values `race` | `training`; each parser returns `kind` in its values and rejects training without a club.

- [ ] **Step 1: Parse and validate in `parse-event-form.ts`**

Add `"kind"` to the `Pick<EventRow, …>` union, then alongside the other reads:

```ts
  const kind = (String(formData.get("kind") ?? "race") === "training" ? "training" : "race") as EventKind;
```

and with the other validations, before the successful return:

```ts
  // Mirrors the events_training_requires_club DB constraint, so the form
  // shows a sentence rather than a Postgres error.
  if (kind === "training" && !clubId) {
    return { ok: false, error: "Pick the club that runs this training session." };
  }
```

Add `kind,` to the returned `values`, and import `EventKind` from `@/lib/supabase/types`.

- [ ] **Step 2: Repeat in the other three parsers**

Apply the identical read, validation and value to `lib/actions/parse-series-form.ts` and `lib/actions/parse-pending-form.ts`. In `lib/actions/parse-pending-form.ts` **omit the club validation** — `events_pending` is deliberately unconstrained, because an ingested candidate may arrive before anyone has identified its club.

In `lib/actions/public-submit.ts`, read `kind` the same way and include it in the inserted row, without the club validation (a public submission lands in the pending queue).

- [ ] **Step 3: Add the toggle to `EventForm`**

In `components/events/EventForm.tsx`, add state beside the existing `clubId` state:

```tsx
  const [kind, setKind] = useState<"race" | "training">(event?.kind ?? "race");
```

and render this directly above the discipline field:

```tsx
      <div style={field}>
        <label style={label}>TYPE</label>
        <div style={{ display: "flex", gap: 8 }}>
          {(["race", "training"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              style={{
                padding: "7px 14px",
                fontSize: 12.5,
                fontWeight: 700,
                cursor: "pointer",
                border: `1px solid ${kind === k ? "#111111" : "#D8D6D0"}`,
                background: kind === k ? "#111111" : "transparent",
                color: kind === k ? "#FAFAF8" : "#4A4A46",
              }}
            >
              {k === "race" ? "Race or event" : "Club training"}
            </button>
          ))}
        </div>
        <input type="hidden" name="kind" value={kind} />
        {kind === "training" && (
          <p style={{ fontSize: 11, color: "#6B6B66", marginTop: 6 }}>
            Training is kept off the main calendar and shown on the clubs page, so a club is required.
          </p>
        )}
      </div>
```

Find the existing `<ClubSelect …>` field and make it required when training is selected — pass `required={kind === "training"}` if `ClubSelect` supports it; if it does not, add the prop to `ClubSelect` and forward it to its underlying `<select>`.

- [ ] **Step 4: Repeat for the other three forms**

Add the same block (repeated in full, not referenced) to `SeriesForm.tsx`, `PendingEditPanel.tsx` and `SubmitEventForm.tsx`, adjusting the local state initialiser to that form's row type (`series?.kind`, `pending?.kind`, and plain `"race"` for the public form). In `SubmitEventForm.tsx` label the options "Race or event" and "Club training" identically, and do not require a club — a member of the public will not know the club id.

- [ ] **Step 5: Type-check and run the suite**

Run: `npx tsc --noEmit && npx playwright test --project=chromium`
Expected: PASS. `e2e/submit-event.spec.ts` still passes because the toggle defaults to "Race or event" and adds no required field.

- [ ] **Step 6: Verify the constraint is enforced**

Run via the Supabase MCP `execute_sql` — this must fail:

```sql
insert into events (title, discipline, kind, start_datetime, venue_name, organiser_url, region)
values ('constraint check', 'clusters', 'training', current_date, 'x', 'https://example.com', 'devon');
```

Expected: error mentioning `training_requires_club`. If it succeeds, delete the row immediately and report — the constraint did not apply.

- [ ] **Step 7: Commit**

```bash
git add components/events lib/actions
git commit -m "Let an event be marked as club training, with a club required"
```

---

### Task 9: Subscribe and embed builders

**Files:**
- Modify: `components/SubscribeSelector.tsx`, `components/EmbedBuilderPage.tsx`
- Test: `e2e/training.spec.ts`

**Interfaces:**
- Consumes: the `?kind=` contract from Tasks 3 and 4.
- Produces: no new exports.

- [ ] **Step 1: Write the failing test**

Append to `e2e/training.spec.ts`:

```ts
test.describe("Subscribe page", () => {
  test("offers no training discipline chip", async ({ page }) => {
    await page.goto("/subscribe");
    await expect(page.getByRole("button", { name: "Training session" })).toHaveCount(0);
  });

  test("choosing club training builds a kind=training feed url", async ({ page }) => {
    await page.goto("/subscribe");
    await page.getByRole("button", { name: /club training/i }).click();
    await expect(page.getByTestId("feed-url")).toContainText("kind=training");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx playwright test e2e/training.spec.ts --project=chromium -g "Subscribe page"`
Expected: FAIL — the training chip is still offered and there is no club-training control.

- [ ] **Step 3: Drop the training chip**

In `components/SubscribeSelector.tsx`, the discipline chips map over `EVENT_DISCIPLINES`. Filter it:

```tsx
// Training is not a discipline you subscribe to here — it is per-club, and
// has its own control below.
const SUBSCRIBABLE_DISCIPLINES = EVENT_DISCIPLINES.filter((d) => d.id !== "clusters");
```

and map over `SUBSCRIBABLE_DISCIPLINES` instead.

- [ ] **Step 4: Add the club-training control**

Add state `const [trainingOnly, setTrainingOnly] = useState(false);`, a toggle button labelled "Club training" beside the club selector, and include the parameter in `feedUrl`:

```tsx
    if (trainingOnly) params.set("kind", "training");
```

Give the element that renders the finished URL `data-testid="feed-url"`.

- [ ] **Step 5: Mirror it in the embed builder**

In `components/EmbedBuilderPage.tsx`, add the same "Club training" toggle, appending `&kind=training` to the generated `/embed` src when on, with a one-line note that a club can use this to show its own sessions on its own site.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx playwright test e2e/training.spec.ts --project=chromium`
Expected: PASS — 13 tests.

- [ ] **Step 7: Run the full suite**

Run: `npx playwright test --project=chromium`
Expected: PASS — `e2e/subscribe.spec.ts`'s existing discipline test uses a non-training discipline and is unaffected.

- [ ] **Step 8: Commit**

```bash
git add components/SubscribeSelector.tsx components/EmbedBuilderPage.tsx e2e/training.spec.ts
git commit -m "Build per-club training feeds from the subscribe and embed pages"
```

---

### Task 10: Ingestion, MCP and chat

**Files:**
- Modify: `lib/ingestion/extract-events.ts`, `app/api/mcp/route.ts`, `lib/actions/chat.ts`

**Interfaces:**
- Consumes: `EventKind` (Task 1), the pending-row `kind` from Task 8.
- Produces: extraction output gains `kind`.

- [ ] **Step 1: Emit `kind` from extraction**

In `lib/ingestion/extract-events.ts`, add `kind` to the extraction schema as an enum of `"race" | "training"`, and add this line to the prompt beside the existing discipline guidance:

```
- kind: "training" for a club's own coaching or academy session (usually weekly, "Go-Ride" style, members or sign-up only); "race" for everything else, including series rounds and open events. A training session almost always names the club that runs it — put that club in organiser_name so a human can attach it in the queue.
```

Set `discipline: "clusters"` and `kind: "training"` together for those, keeping the existing discipline mapping intact.

- [ ] **Step 2: Persist it**

In `lib/ingestion/save-candidates.ts`, include `kind` in the inserted `events_pending` row, defaulting to `"race"` when the model omits it.

- [ ] **Step 3: Update the MCP tool**

In `app/api/mcp/route.ts`, add `kind` to the `submit_event_candidate` input schema as an optional enum defaulting to `"race"`, pass it through to the pending insert, and update the `scope` description string to say training is listed per club rather than on the main calendar.

- [ ] **Step 4: Update the assistant prompt**

In `lib/actions/chat.ts`, change the two places that describe the site so they say the calendar covers races and events, and club training sessions are listed on the clubs page with each club's next session, subscribable per club.

- [ ] **Step 5: Type-check and run the suite**

Run: `npx tsc --noEmit && npx playwright test --project=chromium`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/ingestion app/api/mcp/route.ts lib/actions/chat.ts
git commit -m "Teach ingestion, the MCP tool and the assistant about training"
```

---

### Task 11: Documentation and preview

**Files:**
- Modify: `README.md`, `supabase/migrations/README.md`

- [ ] **Step 1: Update the README**

Document, in the sections that already cover the calendar, the feeds and the data model: the `kind` column and what it separates; that `/calendar.ics` defaults to races and the three ways to ask for training; the per-club training feed URL shape; `clubs.training_note` and why session times live there rather than on event rows; and that training requires a club.

- [ ] **Step 2: Note the migration**

Add `0022_event_kind.sql` to `supabase/migrations/README.md` following the existing entries' format, noting that it backfills `club_id` from `organiser_name` and that the backfill is not reversible.

- [ ] **Step 3: Run everything**

Run: `npm run test:unit && npx tsc --noEmit && npx playwright test`
Expected: PASS — both Playwright projects (chromium and mobile), plus 9 unit tests.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: PASS with no type or lint errors.

- [ ] **Step 5: Commit and push to preview**

```bash
git add README.md supabase/migrations/README.md
git commit -m "Document the club training split"
git push origin worktree-club-training-calendar:preview --force-with-lease
```

- [ ] **Step 6: Hand over for review**

Tell the user the preview is at `https://sw-calendar-alpha.vercel.app` — specifically `/` for the races-only calendar and the training strip, `/clubs` for the training bands, and `/calendar.ics` versus `/calendar.ics?kind=training` for the feeds. Remind them the preview shares the production database, so the migration is already live.

---

## Self-Review

**Spec coverage.** Problem framing → Task 1. Data model, backfill, constraints, index → Task 1. Derivation logic → Task 2. Feeds → Task 3 (`calendar.ics`), Task 4 (`/embed`), Task 9 (builders). Main calendar → Task 4 (races only, hero copy), Task 5 (strip). Clubs page → Task 6 (band, caveat, anchors), Task 7 (`training_note` editing). Authoring surfaces → Task 8. Ingestion, MCP, chat → Task 10. Testing → unit in Task 2, e2e distributed across Tasks 3–9. Rollout and docs → Task 11. No spec section is unimplemented.

**Known soft spots for the implementer.** Three steps depend on code this plan did not read in full and say so inline rather than guessing: `fmtDay`'s return shape (Task 6, Step 3), whether `ClubSelect` accepts `required` (Task 8, Step 3), and the exact shape of the extraction schema and the subscribe/embed builder markup (Tasks 9 and 10). Each names what to check and what to do in either case.

**Type consistency.** `EventKind` is defined once in `lib/supabase/types.ts` and re-declared in `lib/types.ts` for the domain layer, matching how `DisciplineType`/`DisciplineId` are already handled in this codebase. `TrainingSession` is produced by `getUpcomingTraining` (Task 5) and consumed unchanged by `TrainingThisWeek` (Task 5) and `ClubTrainingBand` (Task 6). `KindFilter` lives in the route (Task 3); `getEvents` takes the same three values as a plain union (Task 4).
