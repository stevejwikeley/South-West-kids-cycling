# South West Kids Cycling

A public calendar of youth cycling races and events (cyclocross, XC, road, triathlon, gravel, duathlon) across Devon & Cornwall, England, for ages 5–16. Built with Next.js and Supabase, deployed on Vercel.

Live at [southwestkidscycling.uk](https://www.southwestkidscycling.uk).

## Stack

- **Next.js 16** (App Router, React 19, Server Actions) — see `AGENTS.md` before writing Next.js code, this app tracks a fast-moving pre-release Next.js and the framework docs are vendored into `node_modules/next/dist/docs/`.
- **Supabase** (Postgres + Auth + RLS) for data, `@supabase/ssr` for the client.
- **Anthropic API** (`@anthropic-ai/sdk`) for the smart-ingestion event extraction pipeline — see [`lib/ingestion/README.md`](lib/ingestion/README.md).
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
| `ANTHROPIC_API_KEY` | Yes | Powers the smart-ingestion event extraction (`lib/ingestion/extract-events.ts`). |
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
```

## Project structure

```
app/                    Routes (App Router)
  page.tsx                Public calendar (home page)
  clubs/                   Public club directory
  getting-started/         New-to-racing guide
  contact/                 Contact form (general enquiry / organiser account request)
  subscribe/               Calendar subscription instructions (email digest + ICS feed)
  calendar.ics/            Live ICS feed — supports ?discipline= and ?region= filters
  embed/                   Chrome-free events widget meant for <iframe> on other sites
  events/[id]/suggest-change/   Public "suggest a change" form's standalone fallback route —
                             the calendar page normally opens this in a slide-out panel instead
                             (SuggestChangePanel), this route still works for direct links
  login/                   Auth (admin + organiser)
  admin/                   Admin-only: events, pending queue, watched sources, add events
                             (formerly "smart ingestion" — paste/upload/manual are all here now)
  organiser/               Organiser-only: manage their own events
  api/cron/                Vercel Cron endpoints (see below)
  api/mcp/                 MCP server for weekly event discovery (see below)

components/              Shared UI. components/admin and components/events hold
                          role-specific pieces; everything else is public-facing.
                          EditEventPanel / SuggestChangePanel are the slide-out-panel
                          equivalents of the admin/public event-edit full pages — both
                          fetch the full EventRow client-side since the calendar page only
                          has the display-oriented CalendarEvent shape to start from.

lib/
  actions/                 Server Actions ("use server"), one file per feature
  ingestion/                AI event-extraction pipeline — see its own README
  email/                    Resend email templates + sender
  supabase/                 Supabase client factories + hand-written DB types
  auth.ts                   getCurrentProfile() / isAdminRole() — the one place role checks
                             originate
  data.ts                   Read helpers that map DB rows to the app's CalendarEvent/Club types
  mock-data.ts              Discipline definitions (labels, colors) — not actually mock data,
                             this is the canonical discipline list despite the filename
  analytics.ts              trackEvent() wrapper around gtag

supabase/migrations/     Numbered SQL migrations — see its own README, applying them is manual
e2e/                      Playwright tests
docs/                     Planning docs — specs and reviews written before/instead of
                          immediately shipping the underlying feature; see each file for status
```

## Roles & auth

Three roles, stored in `profiles.role`: `super_admin`, `admin`, and `organiser`. `getCurrentProfile()` (`lib/auth.ts`) is the single source of truth for "who is this and what can they do" — Server Actions and admin/organiser pages call it and reject early rather than relying on RLS alone for authorization decisions in the UI layer. RLS in the database is still the actual security boundary; see `supabase/migrations/0002_auth.sql` for the `is_admin()` helper and policy conventions (broadened to cover `super_admin` in `0012_super_admin_grants.sql`), and follow the same pattern for any new table.

- **Super admins** have every admin capability below, plus the exclusive ability to promote an organiser to admin or demote an admin back to organiser (`/admin`'s "Manage admins" section). This is the only functional difference from a regular admin — it exists so that granting admin access is deliberately a smaller, more trusted set of people than "everyone who can review events." `isAdminRole()` (`lib/auth.ts`) is `true` for both `admin` and `super_admin` and is what almost every admin-gated check should use; the literal `role === "super_admin"` check is reserved for the promote/demote actions themselves.
- **Admins** manage all events, review the pending-change queue, run smart ingestion, manage watched sources, and can invite organisers.
- **Organisers** manage only their own events (`club_id` scoping), and can be invited by an admin.

## Event publishing paths

There are four ways an event reaches the `events_pending` review queue (or, for organisers, straight into `events`):

1. **Manual** — an admin or organiser fills in the event form directly.
2. **Change request** — anyone can submit a correction to an existing event via `/events/[id]/suggest-change`, no login required.
3. **Smart ingestion** — an admin pastes a URL, pastes text, or uploads a file/image on `/admin/ingest` ("Add events" in the nav — the page also has a manual-entry option that skips extraction entirely and publishes straight away, see item 1), or a **watched source** gets checked automatically overnight. Either way, extraction goes through `lib/ingestion/extract-events.ts` (Claude does the extraction) before landing in the pending queue for a human to approve. See [`lib/ingestion/README.md`](lib/ingestion/README.md) for the full pipeline.
4. **Public submission** — anyone can submit a brand-new event via `/submit-event` (linked from the footer), either by pasting a link/text (same AI-extraction pipeline as smart ingestion) or filling in a structured form. Tagged `source_type: "public_submission"` rather than `"smart_ingest"` purely so admins can see where a candidate came from — otherwise it's the exact same pending-queue/approval path (`lib/actions/public-submit.ts`, `saveCandidates()`'s `sourceType` param).

Everything in `events_pending` needs an admin's approval before it becomes a real, published event — smart ingestion never auto-publishes.

Smart-ingestion candidates can carry `field_flags` — fields the extraction pipeline wasn't fully confident about (e.g. `kids_only`, `age_categories`). These survive into the live `events` row on approval and show as a "NEEDS VERIFICATION" badge on the admin event list and in the edit form/panel; a **Verify** button (`verifyEventFields()`, `lib/actions/events.ts`) clears the flag once an admin has reviewed the event — it's an all-or-nothing clear, not per-field.

## Embeddable widget

`/embed` renders a compact, nav/footer/feedback-bubble-free events list meant for `<iframe>`-ing into a club's own site (`TopNav`/`Footer`/`FeedbackPopup` all check the pathname and render nothing under `/embed`). Supports `?region=`, `?discipline=`, `?limit=` to scope what's shown, and always links back to `/subscribe`. The Clubs page has a copyable `<iframe>` snippet (`components/EmbedSnippet.tsx`) so club admins can find and use it without needing to ask.

## Cron jobs (`vercel.json`)

| Path | Schedule | Purpose |
|---|---|---|
| `/api/cron/check-sources` | 03:00 daily | Re-checks every watched source for new/changed events via smart ingestion. |
| `/api/cron/pending-digest` | 15:50 daily | Emails the admin a digest if anything is sitting in the pending queue. |
| `/api/cron/link-health` | 04:20 daily | Checks that published events' booking links still resolve, flags dead ones. |
| `/api/cron/monthly-digest` | 08:00 on the 1st | Emails every active `email_subscribers` row a list of events in the next 31 days. Skips sending if there are none. |

All three authenticate via `CRON_SECRET` as a bearer token (Vercel sends this automatically for configured crons).

## MCP server (`/api/mcp`)

A weekly scheduled Claude task (in the site owner's own claude.ai account, not part of this app's infrastructure) searches the web for new youth cycling events and submits candidates through this MCP server, using the same `mcp-handler` + Claude tool-call flow as any other MCP connector. Auth is a minimal OAuth 2.0 authorization-code+PKCE shim (`lib/mcp-oauth.ts`) purely because claude.ai's "Add custom connector" UI requires OAuth — the token it issues is the same static `MCP_SECRET` used everywhere else, so the actual security boundary hasn't changed shape, just its wire format.

## Planning docs

[`docs/`](docs/) holds specs and reviews written before (or instead of) shipping the underlying work — currently [discipline/location-based subscriptions](docs/discipline-location-subscriptions-spec.md) (not yet built — the calendar feed already supports the filtering, the email digest doesn't yet) and an [SEO/LLM-discoverability review](docs/seo-llm-discoverability-review.md) (partially actioned — see the doc for what's still open, starting with basic search-engine indexation).

## Testing

`npm run test:e2e` runs the Playwright suite (`e2e/`) against a local dev server — desktop Chromium plus a Pixel 7 mobile-emulation project. Covers the calendar, clubs page, contact form, suggest-change flow, and the admin/organiser auth gate.

## Monitoring

- **Errors & performance**: Sentry, wired into both client and server (`instrumentation*.ts`, `sentry.*.config.ts`). The smart-ingestion pipeline is traced end-to-end (`gen_ai.extract_events`, `ingestion.check_watched_source` spans) since it's the subsystem most likely to fail in an interesting way (bad extraction, blocked fetch, API error).
- **Usage**: Google Analytics via `components/GoogleAnalytics.tsx`, with custom events fired through `lib/analytics.ts#trackEvent()` at the interaction points that matter (search, filters, booking-link clicks, form submissions, feedback popup).

## Deployment

Deploys to Vercel on push to `main` (the repo's `master` branch is stale, tens of commits behind, and not what's deployed — check Vercel's project settings before assuming otherwise). Environment variables above must be set in the Vercel project settings — `.env.local` is git-ignored and never deployed. Database migrations are **not** applied automatically; see [`supabase/migrations/README.md`](supabase/migrations/README.md).

### Preview environment

`sw-calendar-alpha.vercel.app` is a Vercel domain bound (Project → Domains → Edit → "Connect to an environment: Preview") to a dedicated `preview` branch — push there (not `main`) to verify a change before it goes live. This exists because Supabase Auth's magic-link sign-in silently falls back to the production Site URL whenever the requesting origin isn't on its redirect allow-list, which made `localhost` sign-in untestable; Supabase's Authentication → URL Configuration → Redirect URLs now includes `https://*.vercel.app/**` alongside the production domain, so signing in on the preview URL works the same as production. It shares the same Supabase project/database as production — there's no sandboxed copy — so anything done while testing there (saving, deleting, sending real emails) is real, not staged.
