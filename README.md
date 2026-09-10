# South West Kids Cycling

A public calendar of youth cycling races and events (cyclocross, XC, road, triathlon, gravel, duathlon) across Devon, Cornwall & Somerset, England, for ages 5–16. Built with Next.js and Supabase, deployed on Vercel.

Live at [southwestkidscycling.uk](https://www.southwestkidscycling.uk).

## Stack

- **Next.js 16** (App Router, React 19, Server Actions) — see `AGENTS.md` before writing Next.js code, this app tracks a fast-moving pre-release Next.js and the framework docs are vendored into `node_modules/next/dist/docs/`.
- **Supabase** (Postgres + Auth + RLS) for data, `@supabase/ssr` for the client.
- **Anthropic API** (`@anthropic-ai/sdk`) for the smart-ingestion event extraction pipeline (see [`lib/ingestion/README.md`](lib/ingestion/README.md)) and the site's "Ask a question" chat widget (`lib/actions/chat.ts`).
- **Resend** for transactional email (contact form, pending-approval digest).
- **Sentry** for error tracking and performance tracing.
- **Google Analytics** (gtag) for usage analytics.
- **Playwright** for end-to-end tests.
- **Vercel** for hosting, cron jobs, and deployment.

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You'll need a `.env.local` — copy `.env.example` and fill in the values (see below for where each one comes from).

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon/public key — used by the browser and by server-side reads that respect RLS. |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Bypasses RLS — used only in trusted server contexts (cron jobs, admin actions). Never expose to the client. |
| `NEXT_PUBLIC_SITE_URL` | Yes | Canonical site URL, used for absolute links (ICS feed, emails, OG tags). |
| `ANTHROPIC_API_KEY` | Yes | Powers the smart-ingestion event extraction (`lib/ingestion/extract-events.ts`), the club "Look up online" web-search lookup (`lib/club-research.ts`), and the event "Generate from source" description writer (`lib/event-description.ts`). |
| `RESEND_API_KEY` | Yes | Sends transactional email via Resend. |
| `RESEND_FROM_EMAIL` | Yes | From-address for outgoing email. |
| `ADMIN_NOTIFICATION_EMAIL` | Yes | Where contact-form submissions and the pending-approval digest are sent. |
| `CRON_SECRET` | Yes | Shared secret Vercel Cron sends as a bearer token to authorize `/api/cron/*` routes. |
| `MCP_SECRET` | Yes | Bearer/OAuth secret for the `/api/mcp` server (weekly event-discovery connector — see below). |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | No | Google Analytics measurement ID (`G-XXXXXXX`). Analytics no-ops if unset. |
| `NEXT_PUBLIC_SENTRY_DSN` | No | Sentry DSN. Sentry no-ops if unset. |
| `SENTRY_ORG` / `SENTRY_PROJECT` / `SENTRY_AUTH_TOKEN` | No | Only needed for source-map upload on build — not required for error tracking itself. |

## Scripts

```bash
npm run dev        # start the dev server
npm run build       # production build
npm run start        # run a production build locally
npm run lint         # eslint
npm run test:e2e     # Playwright end-to-end tests
npm run traffic-report  # append a weekly Vercel Web Analytics summary to docs/traffic-reports.md
```

## Project structure

```
app/                    Routes (App Router)
  page.tsx                Public calendar (home page)
  clubs/                   Public club directory
  admin/clubs/, organiser/clubs/   Create/edit/delete clubs — see "Clubs" below
  getting-started/         New-to-racing guide
  contact/                 Contact form (general enquiry / organiser account request)
  subscribe/               Calendar subscription instructions (email digest + ICS feed)
  calendar.ics/            Live ICS feed — supports ?discipline= and ?region= filters
  embed/                   Chrome-free events widget meant for <iframe> on other sites
  events/[id]/            Public event detail page — shows the signup form when the event
                             is bookable (`bookable` column + capacity/waitlist state)
  events/[id]/suggest-change/   Public "suggest a change" form's standalone fallback route —
                             the calendar page normally opens this in a slide-out panel instead
                             (SuggestChangePanel), this route still works for direct links
  my-events/               Attendee-facing area, magic-link auth (no password): (public)/login
                             requests the link, (protected)/ lists the attendee's own bookings
                             across events
  login/                   Auth (admin + organiser)
  admin/                   Admin-only: events, pending queue, watched sources, add events
                             (formerly "smart ingestion" — paste/upload/manual are all here now);
                             events/[id]/attendees/ manages/messages one event's bookings
  organiser/               Signed-in (admin or organiser): manage their own events;
                             events/[id]/attendees/ is the organiser-scoped equivalent of the
                             admin attendees page. clubs/ is NOT scoped to "own" — clubs are
                             shared reference data any organiser can create/edit
  api/cron/                Vercel Cron endpoints (see below)
  api/mcp/                 MCP server for weekly event discovery (see below)

components/              Shared UI. components/admin and components/events hold
                          role-specific pieces; everything else is public-facing.
                          EditEventPanel / SuggestChangePanel are the slide-out-panel
                          equivalents of the admin/public event-edit full pages — both
                          fetch the full EventRow client-side since the calendar page only
                          has the display-oriented CalendarEvent shape to start from.
                          SeriesForm / SeriesList are the recurring-event equivalents of
                          EventForm / EventList; EventOrSeriesForm is the one-off/repeating
                          toggle shown on the "add event" pages. components/clubs/ holds the
                          club CRUD form/list plus ClubSelect (the "CLUB" field embedded in
                          EventForm/SeriesForm/PendingEditPanel, which owns the inline
                          "+ Add new club…" quick-add) and ClubQuickAdd/ClubFields it's built from.

lib/
  actions/                 Server Actions ("use server"), one file per feature
                             (event-series.ts creates/edits/deletes recurring series and
                             their generated occurrences, parse-series-form.ts validates the
                             series form and builds prefill values when converting an existing
                             event to a series — see "Event publishing paths"; bookings.ts
                             creates/cancels a booking and promotes off the waitlist when a
                             confirmed spot frees up)
  ingestion/                AI event-extraction pipeline — see its own README
  email/                    Resend email templates + sender (booking-confirmation.ts,
                             waitlist-promoted.ts, booking-reminder.ts and
                             attendee-message.ts are the booking-flow templates)
  supabase/                 Supabase client factories + hand-written DB types
  auth.ts                   getCurrentProfile() / isAdminRole() — the one place role checks
                             originate
  data.ts                   Read helpers that map DB rows to the app's CalendarEvent/Club types
  mock-data.ts              Discipline definitions (labels, colors) — not actually mock data,
                             this is the canonical discipline list despite the filename
  recurrence.ts             Pure weekly-occurrence-date generation for recurring series, no
                             Supabase dependency
  analytics.ts              trackEvent() wrapper around gtag

supabase/migrations/     Numbered SQL migrations — see its own README, applying them is manual
e2e/                      Playwright tests
docs/                     Planning docs — specs and reviews written before/instead of
                          immediately shipping the underlying feature; see each file for status
```

## Roles & auth

Three roles, stored in `profiles.role`: `super_admin`, `admin`, and `organiser`. `getCurrentProfile()` (`lib/auth.ts`) is the single source of truth for "who is this and what can they do" — Server Actions and admin/organiser pages call it and reject early rather than relying on RLS alone for authorization decisions in the UI layer. RLS in the database is still the actual security boundary; see `supabase/migrations/0002_auth.sql` for the `is_admin()` helper and policy conventions (broadened to cover `super_admin` in `0012_super_admin_grants.sql`), and follow the same pattern for any new table.

- **Super admins** have every admin capability below, plus the exclusive ability to invite someone directly as an admin, and to promote an organiser to admin or demote an admin back to organiser (`/admin/team`). This is the only functional difference from a regular admin — it exists so that granting admin access is deliberately a smaller, more trusted set of people than "everyone who can review events." `isAdminRole()` (`lib/auth.ts`) is `true` for both `admin` and `super_admin` and is what almost every admin-gated check should use; the literal `role === "super_admin"` check is reserved for the invite-as-admin and promote/demote actions themselves.
- **Admins** manage all events, review the pending-change queue, run smart ingestion, manage watched sources, can invite organisers, and can see the full `/admin/team` roster (just without the promote/demote/invite-as-admin controls).
- **Organisers** manage only their own events (`created_by` scoping), and can be invited by an admin. Clubs are the one exception to "own events only" — any admin or organiser can create/edit/delete any club (see "Clubs" below), since clubs are shared reference data rather than something one organiser owns.
- **Inviting someone directly as admin or organiser** (`/admin/team`, `inviteTeamMember` in `app/admin/actions.ts`) sends a Supabase Auth invite email with the intended role baked into `raw_user_meta_data`. `handle_new_user()` (`0014_invite_role_metadata.sql`) reads that metadata when creating the new `profiles` row, so the person lands with the correct role from their very first sign-in — no separate "sign up, then get promoted" step. That metadata is only ever set server-side by the super_admin-gated invite action and is consumed synchronously at signup, before the invited person has ever authenticated, so they can't influence their own starting role.

**Attendees** are a separate, public self-signup identity, not a fourth entry in the role hierarchy above — anyone can become one by booking an event, no invite needed. They authenticate the same way as the three roles above (Supabase Auth magic link), but `handle_new_user()`'s role-metadata branch (extended in `0018_event_booking.sql`) routes `role: 'attendee'` into a separate `attendees` table instead of `profiles`, so they never gain admin/organiser access of any kind. `getCurrentAttendee()` (`lib/auth.ts`) is their equivalent of `getCurrentProfile()`, and `/my-events` is their equivalent of the admin/organiser dashboards.

## Event publishing paths

There are four ways an event reaches the `events_pending` review queue (or, for organisers, straight into `events`):

1. **Manual** — an admin or organiser fills in the event form directly. This includes recurring events (e.g. weekly club training): the "add event" pages offer a "Repeating event" mode (`EventOrSeriesForm` → `SeriesForm`) that picks a set of weekdays and a required end date, then generates one `events` row per occurrence up front (`lib/actions/event-series.ts`, `lib/recurrence.ts`) — bounded, so there's no background job involved. A date can be skipped individually, and editing one occurrence's own fields detaches it from the series (`series_detached`) so a later series-wide edit never overwrites that customization. An existing one-off event can also be turned into a series after the fact — its edit page has a "Convert to a recurring event" link (`?from=<eventId>` on `/admin|organiser/series/new`) that prefills the new-series form from that event (`eventRowToSeriesPrefill()`, `lib/actions/parse-series-form.ts`) and replaces the original standalone event with the generated occurrences once saved.
2. **Change request** — anyone can submit a correction to an existing event via `/events/[id]/suggest-change`, no login required.
3. **Smart ingestion** — an admin pastes a URL, pastes text, or uploads a file/image on `/admin/ingest` ("Add events" in the nav — the page also has a manual-entry option that skips extraction entirely and publishes straight away, see item 1), or a **watched source** gets checked automatically overnight. Either way, extraction goes through `lib/ingestion/extract-events.ts` (Claude does the extraction) before landing in the pending queue for a human to approve. See [`lib/ingestion/README.md`](lib/ingestion/README.md) for the full pipeline.
4. **Public submission** — anyone can submit a brand-new event via `/submit-event` (linked from the footer), either by pasting a link/text (same AI-extraction pipeline as smart ingestion) or filling in a structured form. Tagged `source_type: "public_submission"` rather than `"smart_ingest"` purely so admins can see where a candidate came from — otherwise it's the exact same pending-queue/approval path (`lib/actions/public-submit.ts`, `saveCandidates()`'s `sourceType` param).

Everything in `events_pending` needs an admin's approval before it becomes a real, published event — smart ingestion never auto-publishes.

Smart-ingestion candidates can carry `field_flags` — fields the extraction pipeline wasn't fully confident about (e.g. `kids_only`, `age_categories`). These survive into the live `events` row on approval and show as a "NEEDS VERIFICATION" badge on the admin event list and in the edit form/panel; a **Verify** button (`verifyEventFields()`, `lib/actions/events.ts`) clears the flag once an admin has reviewed the event — it's an all-or-nothing clear, not per-field.

## Event descriptions

Every event has an optional `description` (`events.description`, also on `events_pending` and `event_series`), shown on the event detail page — a short, welcoming few sentences aimed at someone who might be coming for the first time (what to expect, what makes it worth attending, anything that lowers the barrier for a beginner), not a neutral directory blurb. It's never required and never invents detail beyond what its source actually says.

- **AI-ingested events** (smart ingestion, or the public paste-a-link path) get it for free — `description` is just another field in `extract-events.ts`'s extraction schema, generated from whatever source text/page the pipeline is already reading.
- **Everywhere else** (admin/organiser event and series forms, the pending-queue edit panel, and the public `/submit-event` structured form — deliberately available to all of these, not gated to staff, since it only ever reads a URL the person themselves supplied) has a "Generate from source" button next to the description field. It fetches the event's organiser URL directly (`lib/event-description.ts`, via `generateDescriptionAction()` in `lib/actions/event-description.ts`) and asks Claude to write the description from that page's actual content — same propose-into-an-editable-field-don't-auto-save posture as the club "Look up online" button and AI event ingestion generally.
- **Backfilling existing events** that predate this feature is a one-off admin tool, not a migration script — `/admin` shows a "Missing descriptions" panel (`components/admin/BackfillDescriptions.tsx`) whenever any live event has none, working through them one at a time (sequential, not parallel, since each one is an LLM call + external page fetch) with a stoppable/resumable progress view. It disappears on its own once every event has a description.

## Embeddable widget

`/embed` renders a compact, nav/footer/feedback-bubble-free events list meant for `<iframe>`-ing into a club's own site (`TopNav`/`Footer`/`FeedbackPopup`/`ChatWidget` all check the pathname and render nothing under `/embed`). Supports `?region=`, `?discipline=`, `?club=`, `?limit=` to scope what's shown, and always links back to `/subscribe`. `/embed-builder` (`components/EmbedBuilderPage.tsx`) is the point-and-click UI for constructing that query string and copying the resulting `<iframe>` snippet — useful for a club that wants to show only its own events. The Clubs page also has a copyable generic `<iframe>` snippet (`components/EmbedSnippet.tsx`) linking to the builder.

## Clubs

Every event can optionally be linked to one club (`events.club_id`, nullable, `on delete set null`) — the "CLUB" select on the admin/organiser event and series forms, the pending-queue edit panel, and the public `/submit-event` structured form all share this. It's purely descriptive: unlike organiser scoping, it has no effect on RLS or who can edit an event. A club's name shows as a badge on the calendar and in the pending-queue diff view, and as a "Club:" line on the event detail page; the calendar and `/embed` can both filter down to one club (`?club=<id>` on the embed route). When an event comes in through AI extraction (smart ingestion or the public paste-a-link path), `saveCandidates()` (`lib/ingestion/save-candidates.ts`) tries to match the extracted `organiser_name` against a club name (`lib/club-match.ts`) — only an exact, unambiguous match sets `club_id` automatically; anything less certain is left for an admin to set by hand during review.

**Managing clubs.** `/admin/clubs` and `/organiser/clubs` (`lib/actions/clubs.ts`, `components/clubs/ClubForm.tsx`) are full create/edit/delete pages for the `clubs` table — any signed-in admin or organiser can manage any club, since clubs are shared reference data, not owned per-organiser (`0020_club_write_access.sql` adds the `is_staff()`-gated write policies this needs; `clubs` originally shipped with only a public-read policy). The same "CLUB" field embedded in the event/series/pending forms (`components/clubs/ClubSelect.tsx`) has a trailing "+ Add new club…" option that opens an inline quick-add (`ClubQuickAdd.tsx`) instead of navigating away — creating a club there calls `createClub()` directly (not through `useActionState`, since the caller needs the new row back synchronously to select it) and selects the new club immediately.

**AI-assisted lookup.** Both the full club form and the quick-add have a "Look up online" button next to the name field, calling `researchClubAction()` → `researchClub()` (`lib/club-research.ts`). This uses the same Claude + structured-output pattern as `extract-events.ts`, but with Anthropic's `web_search` tool so the model can actually search for the named club and return its location, website, disciplines, age range, founding year and a short summary — same "propose, don't auto-save" posture as AI-ingested events: it only prefills the form's fields, which are then still reviewed and submitted by a human.

## Chat assistant

A floating "Ask a question" widget (`components/ChatWidget.tsx`, bottom-left on every public page except `/admin`, `/organiser`, `/login`, `/auth`, `/oauth` and `/embed`) answers questions about disciplines, subscribing, clubs, and specific events. `lib/actions/chat.ts` grounds each reply in a system prompt built from live data (`getEvents()`, `getClubs()`) plus a hand-written FAQ (disciplines, subscribing, getting started, event submission) — it's told never to invent a date, venue, or booking link. If it doesn't know the answer or the user needs a real person, it points them to WhatsApp (`lib/whatsapp.ts`), whose link is also always shown under the message input.

## Cron jobs (`vercel.json`)

| Path | Schedule | Purpose |
|---|---|---|
| `/api/cron/check-sources` | 03:00 daily | Re-checks every watched source for new/changed events via smart ingestion. |
| `/api/cron/pending-digest` | 15:50 daily | Emails the admin a digest if anything is sitting in the pending queue. |
| `/api/cron/link-health` | 04:20 daily | Checks that published events' booking links still resolve, flags dead ones. |
| `/api/cron/monthly-digest` | 08:00 on the 1st | Emails every active `email_subscribers` row a list of events in the next 31 days. Skips sending if there are none. |
| `/api/cron/booking-reminders` | 18:00 daily | Finds bookable events happening tomorrow (UK time) and emails every confirmed attendee a reminder, once each. |

Recurring-event occurrence generation deliberately has **no** cron entry here: every series has a required end date, so its full occurrence set is bounded and generated synchronously in one bulk insert when the series is created or edited (`lib/actions/event-series.ts`) rather than needing a job to keep a rolling window topped up.

All five authenticate via `CRON_SECRET` as a bearer token (Vercel sends this automatically for configured crons).

## MCP server (`/api/mcp`)

A weekly scheduled Claude task (in the site owner's own claude.ai account, not part of this app's infrastructure) searches the web for new youth cycling events and submits candidates through this MCP server, using the same `mcp-handler` + Claude tool-call flow as any other MCP connector. Auth is a minimal OAuth 2.0 authorization-code+PKCE shim (`lib/mcp-oauth.ts`) purely because claude.ai's "Add custom connector" UI requires OAuth — the token it issues is the same static `MCP_SECRET` used everywhere else, so the actual security boundary hasn't changed shape, just its wire format.

## Planning docs

[`docs/`](docs/) holds specs and reviews written before (or instead of) shipping the underlying work — currently [discipline/location-based subscriptions](docs/discipline-location-subscriptions-spec.md) (not yet built — the calendar feed already supports the filtering, the email digest doesn't yet) and an [SEO/LLM-discoverability review](docs/seo-llm-discoverability-review.md) (partially actioned — see the doc for what's still open, starting with basic search-engine indexation).

## Testing

`npm run test:e2e` runs the Playwright suite (`e2e/`) against a local dev server — desktop Chromium plus a Pixel 7 mobile-emulation project. Covers the calendar, clubs page, contact form, suggest-change flow, and the admin/organiser auth gate.

## Monitoring

- **Errors & performance**: Sentry, wired into both client and server (`instrumentation*.ts`, `sentry.*.config.ts`). The smart-ingestion pipeline is traced end-to-end (`gen_ai.extract_events`, `ingestion.check_watched_source` spans) since it's the subsystem most likely to fail in an interesting way (bad extraction, blocked fetch, API error).
- **Usage**: Google Analytics via `components/GoogleAnalytics.tsx`, with custom events fired through `lib/analytics.ts#trackEvent()` at the interaction points that matter (search, filters, booking-link clicks, form submissions, feedback popup). Also **Vercel Web Analytics** (`<Analytics />` in `app/layout.tsx`) — chosen alongside GA because it's queryable via `vercel metrics`/the Web Analytics REST API using the CLI's own login, with no separate Google Cloud project or credentials needed. `scripts/weekly-traffic-report.sh` pulls page views, unique visitors, top pages, and top referrers for the last 7 days and appends them to [`docs/traffic-reports.md`](docs/traffic-reports.md); a `launchd` job (`~/Library/LaunchAgents/uk.co.southwestkidscycling.traffic-report.plist`, local to the machine that set it up, not checked in) runs it every Sunday at 18:00.

## Deployment

Deploys to Vercel on push to `main` (the repo's `master` branch is stale, tens of commits behind, and not what's deployed — check Vercel's project settings before assuming otherwise). Environment variables above must be set in the Vercel project settings — `.env.local` is git-ignored and never deployed. Database migrations are **not** applied automatically; see [`supabase/migrations/README.md`](supabase/migrations/README.md).

### Preview environment

`sw-calendar-alpha.vercel.app` is a Vercel domain bound (Project → Domains → Edit → "Connect to an environment: Preview") to a dedicated `preview` branch — push there (not `main`) to verify a change before it goes live. This exists because Supabase Auth's magic-link sign-in silently falls back to the production Site URL whenever the requesting origin isn't on its redirect allow-list, which made `localhost` sign-in untestable; Supabase's Authentication → URL Configuration → Redirect URLs now includes `https://*.vercel.app/**` alongside the production domain, so signing in on the preview URL works the same as production. It shares the same Supabase project/database as production — there's no sandboxed copy — so anything done while testing there (saving, deleting, sending real emails) is real, not staged.
