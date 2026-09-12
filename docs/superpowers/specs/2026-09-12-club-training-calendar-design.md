# Club training calendar — design

Date: 2026-09-12
Status: approved, ready for implementation planning

## Problem

Two thirds of the calendar is training. On 2026-09-12 the live database holds
67 upcoming approved events, of which **47 are training sessions**
(`discipline = 'clusters'`). Those 47 rows come from only **five distinct
programmes at three clubs**:

| Programme | Club | Rows |
|---|---|---|
| Wheal Velocity Junior Academy — Weekly Training (Saturdays) | Wheal Velocity | 15 |
| Sulis Scorpions Youth CC — Weekly Coaching (Saturdays) | Sulis Scorpions | 15 |
| Mid Devon Youth Academy Training | Mid Devon CC | 13 |
| Thursday Night Training | Wheal Velocity | 2 |
| Outdoor Training (road / off-road) | Wheal Velocity | 2 |

The consequences are three-fold. The calendar reads as bloated and
unfocused, and club training is not relevant to most visitors, who come
looking for races. The iCalendar subscription inherits the same bloat: a
subscriber to the plain feed gets 47 training entries they did not ask for.
And the data claims a precision it does not have — training times shift at
short notice, so each row is better understood as a hint about when a club
usually trains than as a commitment.

A fourth problem is latent: **41 of the 47 training rows have no `club_id`**,
including both generated series. Training is conceptually owned by a club,
but the data does not yet say so.

## Goals

- The main calendar shows races and events, not club training.
- The default `.ics` subscription carries races only.
- Training is discoverable through the clubs page, attached to the club that
  runs it, and framed honestly as a recurring pattern rather than a promise.
- Nothing silently breaks for people who already subscribed to a training feed.

## Non-goals

Per-club pages (`/clubs/<slug>`), booking onto a training session, and
training in the monthly digest are all out of scope. Booking remains
*possible* later because training stays as real event rows — that is the
main reason for the model chosen below.

## Decisions

**Training stays in the `events` table, distinguished by a new `kind`
column.** The alternative — a `club_training_sessions` schedule table holding
only the weekly pattern — was considered and rejected. It would have produced
a smaller, more honest dataset and a single `RRULE` entry per club feed, but
it would have cut training off from bookings, event detail pages and
suggest-a-change, all of which key on `events.id`. Since club-managed booking
is the stated direction, keeping training as event rows preserves that path.
The feed bloat that actually matters — the *default* subscription — is solved
by filtering, and a per-club training feed containing 15 dates is correct,
because someone subscribing to Wheal Velocity's training wants those dates.

**Training requires a club.** A training event with no club has nowhere to
live on the clubs page, so the database enforces the link and the authoring
forms make the club field required when Training is selected, with the
existing inline quick-add for a club that does not exist yet.

**`discipline` is left alone.** Training rows keep `discipline = 'clusters'`;
`kind` now carries the training-ness. Rewriting 47 rows to a "real" discipline
would be churn for no user-visible gain once training is off the main
calendar, where discipline filtering happens.

**Training appears in a feed only when explicitly requested.** `/calendar.ics`
with no parameters is races-only. Training arrives via `?kind=training`,
`?kind=all`, or any request that names `discipline=clusters`. That last clause
exists so an existing training-only subscription keeps delivering instead of
silently emptying — a subscribed calendar that goes blank looks like a bug to
the subscriber and is invisible to us.

**Session times come from prose, not timestamps.** Migration `0004`
normalised every event to all-day at midnight UTC, so no training row carries
a real time, and all 47 carry the full `u8–u16` age range, which is a default
rather than a fact. Rather than invent times, the clubs page derives the
weekday pattern from the dates that exist ("Trains Saturdays") and shows an
optional free-text `clubs.training_note` for what only the club knows:
*"Junior Academy, Saturdays 10:00–11:30 at Wheal Jane, term time only —
message Dave before your first visit."*

## Data model

Migration `0022_event_kind.sql`:

```sql
create type event_kind as enum ('race', 'training');

alter table events         add column kind event_kind not null default 'race';
alter table events_pending add column kind event_kind not null default 'race';
alter table event_series   add column kind event_kind not null default 'race';

alter table clubs add column training_note text;
```

Backfill, in the same migration:

- `update events set kind = 'training' where discipline = 'clusters'`, and the
  same for `events_pending` and `event_series`.
- `club_id` filled from `organiser_name` for the 41 orphans. All three names
  map unambiguously to an existing club: *Mid Devon Cycling Club* →
  Mid Devon CC, *Wheal Velocity* / *Wheal Velocity Cycling Club* →
  Wheal Velocity, *Sulis Scorpions Youth CC* → Sulis Scorpions Youth Cycling
  Club. The mapping is written as explicit `update ... where organiser_name =`
  statements rather than a fuzzy match, so the migration is deterministic and
  reviewable.

The club requirement is added *after* the backfill, so it cannot fail on
existing data:

```sql
alter table events add constraint training_requires_club
  check (kind <> 'training' or club_id is not null);
```

with the matching constraint on `event_series`. `events_pending` is
deliberately left unconstrained — an ingested candidate may legitimately
arrive without a club identified, and the queue is where a human attaches one
before approval.

Index for the clubs-page query:

```sql
create index events_training_club_date_idx
  on events (club_id, start_datetime)
  where kind = 'training';
```

Verification after applying: no training row lacking a club, counts per club
matching the table above, and `select count(*) from events where kind='race'
and start_datetime >= current_date` returning 20.

## Derivation logic

A new pure module `lib/training.ts`, unit-testable with no Supabase
dependency, in the spirit of `lib/recurrence.ts`:

- `nextSessions(events, today, n)` — the next `n` upcoming dates for a club.
- `weekdayPattern(events)` — returns `"Saturdays"` when every upcoming session
  falls on one weekday, `"Tuesdays & Saturdays"` for two, and `null` when the
  dates are irregular. When it returns `null` the clubs page shows dates only,
  never a made-up pattern.
- `groupByClub(events)` and `sessionsInNextDays(events, today, 7)` for the
  calendar strip.

`lib/data.ts` gains `getTrainingByClub()` returning upcoming training grouped
by `club_id`, and `getEvents()` gains an optional kind filter. Existing
callers default to races, which is what every current caller wants.

## Main calendar

`components/CalendarPage.tsx` renders races only. The "Training session"
discipline chip disappears without code change, because `visibleDisciplines`
is already derived from the disciplines actually present in the passed
events.

A new `components/clubs/TrainingThisWeek.tsx` strip sits under the hero:
sessions in the next seven days, grouped by club, each linking to that club's
row on `/clubs` via an anchor. The strip renders nothing at all when the week
is empty — a quiet week should look quiet, not broken.

Hero copy changes from "Every Under 8s–16s race and training session…" to
name races and events, with a link across to club training.

## Clubs page

`components/ClubsPage.tsx` gains a band on each club row that trains: the
derived pattern and venue, the `training_note` when set, the next date plus
the two after it, and an **Add this club's training to my calendar** link to
`/calendar.ics?club=<id>&kind=training`.

Clubs with no training listed show a short prompt inviting someone to tell us
about theirs, linking to `/submit-event`.

A caveat line states plainly that training times can change at short notice
and to check with the club — the honest framing this whole change is built
around.

## Feeds

`app/calendar.ics/route.ts` gains `kind` to its existing filter parsing,
defaulting to races. The three ways to opt into training are listed under
Decisions. `feedName()` reflects training in the calendar name, so a
subscriber with several feeds can tell them apart.

`app/embed/page.tsx` takes the same default and the same `?kind=` parameter,
letting a club embed its own training with `?club=…&kind=training`.

`components/SubscribeSelector.tsx` drops the "Training session" discipline
chip and grows a club-training section that builds the per-club feed URL.
`components/EmbedBuilderPage.tsx` gets the equivalent option.

## Authoring surfaces

A Race/Training toggle is added to `EventForm`, `SeriesForm`,
`PendingEditPanel` and the public `SubmitEventForm`, with the club field
becoming required, and inline quick-add offered, when Training is selected.
Generated occurrences inherit `kind` from their series.

`lib/ingestion/extract-events.ts` emits `kind` alongside `discipline`, keeping
the existing `clusters` mapping. `lib/actions/public-submit.ts` and the MCP
`submit_event_candidate` tool set it too. `lib/actions/chat.ts` is updated so
the assistant describes where training now lives.

## Testing

Unit tests with Node's built-in runner — `node --test
--experimental-strip-types`, no new dependency, added as `npm run test:unit`:

- `weekdayPattern` for one weekday, two weekdays, irregular dates (null), and
  an empty list.
- `nextSessions` for ordering, the `n` limit, a club with nothing upcoming,
  and a session dated today.
- Feed filter parsing: default excludes training; each of the three opt-ins
  includes it; an unknown `kind` value degrades to the default rather than
  erroring, matching how the existing filters behave.

Playwright, extending the existing suite:

- The calendar page shows no training session.
- The clubs page shows a next session for a club that trains, and the prompt
  for one that does not.
- `/calendar.ics` excludes training; `?kind=training` includes it;
  `?discipline=clusters` still returns training.

## Rollout

Work happens in the `worktree-club-training-calendar` worktree, based on
`origin/main` (713e851). The migration is applied to project
`mpbptzacxbxadvwnqdol` via the Supabase MCP and verified by query before any
UI work depends on it. The branch is then pushed to `preview` for checking at
`sw-calendar-alpha.vercel.app` with real auth. `README.md` is updated in the
same branch, per the project's continuous-documentation convention.

Note that the preview environment shares the production database, so the
migration and backfill are live changes from the moment they are applied.

## Risks

**Existing plain-feed subscribers lose training.** This is the intended
effect, but it is a visible change to calendars people already have. The
`?discipline=clusters` carve-out limits it to those who subscribed to
everything.

**Training detail pages stay indexed.** Training events keep their
`/events/<id>` pages and sitemap entries. They are real pages with real
content, and removing them would discard existing search traffic.

**The backfill is not reversible by the migration.** `kind` can be recomputed
from `discipline = 'clusters'`, but the `club_id` values it writes cannot be
distinguished afterwards from ones set by hand. The mapping is small and
explicit, and is verified by query immediately after applying.
