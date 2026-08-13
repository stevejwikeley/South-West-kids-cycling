# Spec: subscribe by discipline and/or location

## Goal

Let someone subscribe only to the events relevant to them — e.g. "cyclocross and XC in Cornwall only" — instead of the full Devon & Cornwall, all-disciplines feed. Applies to both subscription mechanisms the site already has: the calendar feed (`calendar.ics`) and the monthly email digest.

## Current state

**Calendar feed — already supports this, just not surfaced in the UI.** `app/calendar.ics/route.ts` already accepts `?discipline=cx,xc&region=devon` and filters server-side (`parseFilters()`, `DISCIPLINE_VALUES`/`REGION_VALUES`). The `/subscribe` page's `SubscribeSelector.tsx` hardcodes `CALENDAR_URL` to the unfiltered feed and never exposes these params. This is the cheap win.

**Email digest — no filtering exists anywhere in the pipeline.** `email_subscribers` (`supabase/migrations/0009_email_subscribers.sql`) is just `id, email, unsubscribe_token, subscribed_at, unsubscribed_at`. `app/api/cron/monthly-digest/route.ts` fetches every event once, then loops subscribers sending everyone the identical HTML. Adding filtering here means storing a preference per subscriber and building each digest from a per-subscriber-filtered event list.

## Part 1: Calendar feed (small)

1. **`SubscribeSelector.tsx`**: add a discipline multi-select (reuse `EVENT_DISCIPLINES` from `lib/mock-data.ts`, same list `getting-started/page.tsx` and `CalendarPage.tsx` already use) and a region choice (Devon / Cornwall / Both — reuse the `REGION_HINT`/region option pattern from `CalendarPage.tsx`). Selections are client-only `useState`, no submission — they just change which URL `CopyLink` and the "Open in Calendar" button use.
2. Build the URL as `https://www.southwestkidscycling.uk/calendar.ics?discipline=cx,xc&region=devon`, omitting empty params so "no selection" still means "everything" (matches the route's existing behavior — `parseFilters` treats an absent/empty param as no filter).
3. No backend change needed at all. No migration. This is purely `SubscribeSelector.tsx` plus maybe a shared constants import.
4. Copy: make clear that changing the discipline/region selection after already subscribing means re-copying a new URL and re-adding it as a new calendar subscription (existing calendar apps don't support editing a live feed's URL in place) — same "you can't retroactively edit a subscription" reality Apple/Google/Outlook impose that the current instructions already work around by just re-subscribing.

## Part 2: Email digest (medium)

### Schema

New migration adding two nullable columns to `email_subscribers`:

```sql
alter table email_subscribers add column disciplines text[]; -- null = all disciplines
alter table email_subscribers add column region text;         -- null = both regions
```

`null`/empty array = no filter on that dimension, mirroring the ICS route's existing "empty param = everything" convention so the two systems stay conceptually consistent. `region` is a single value (`devon` | `cornwall` | `both`) rather than an array, matching `RegionType` elsewhere in the codebase (events themselves are never in more than one region).

### Subscribe form

`lib/actions/subscribe-email.ts` (wherever the current email-only subscribe form lives — likely embedded in `/subscribe` or its own small form component) needs the same discipline/region controls as Part 1's calendar selector, submitted alongside the email address. Reasonable to share one selector component between the ICS URL builder and the email form's hidden inputs, so "what do you want to hear about" is asked once with two consumers.

### Digest generation

`app/api/cron/monthly-digest/route.ts` already loops subscribers individually (one `sendEmail()` call per subscriber, not a batch send) — this is what makes per-subscriber filtering tractable without restructuring the send path:

```ts
const allEvents = /* existing fetch, unchanged */;

for (const subscriber of subscribers) {
  const filtered = allEvents.filter(e =>
    (!subscriber.disciplines?.length || subscriber.disciplines.includes(e.discipline)) &&
    (!subscriber.region || subscriber.region === "both" || e.region === subscriber.region || e.region === "both")
  );
  if (filtered.length === 0) continue; // don't send an empty digest
  await sendEmail({ ...,  html: buildMonthlyDigestHtml(filtered, siteUrl, unsubscribeUrl) });
}
```

Subject line's event count (`${events.length} upcoming events`) needs to use `filtered.length`, not the global count. Everything else in the loop (error handling, Sentry tagging, the `sent` counter) is unchanged.

### Unsubscribe / preference management

Out of scope for a first version — the existing unsubscribe link keeps working unmodified (it doesn't touch these new columns). A "change what I'm subscribed to" self-service page is a natural follow-up but isn't required to ship filtering itself: `subscribeEmail()` (`lib/actions/subscribe-email.ts`) already does `upsert({ email, unsubscribed_at: null }, { onConflict: "email" })`, so re-subscribing with a different discipline/region selection already updates the existing row rather than erroring — just add `disciplines`/`region` to that same upsert payload and re-subscribing to change preferences works for free.

## Part 3: Location, more precisely than Devon/Cornwall

The request mentions "and possible location" — the region column only has three values (`devon`, `cornwall`, `both`), which is coarse. Two options, in increasing effort:

- **Do nothing further.** Devon/Cornwall is the only location dimension that exists anywhere in the schema today (events don't have lat/lng-based radius querying wired to any UI, even though `events.lat`/`events.lng` columns exist). Shipping region-level filtering (Part 2) already covers "possible location" at the granularity the rest of the site uses.
- **Radius-based filtering** ("events within N miles of postcode X") would need: geocoding a subscriber's postcode/town on signup (a new external API call — not currently integrated), storing a lat/lng per subscriber, and a distance calculation in the digest loop (`events.lat`/`lng` already exist and are populated for some events — worth checking actual coverage before committing to this, since a distance filter is only as good as how many events have coordinates). This is meaningfully more work than Part 2 and probably not worth it unless region-level filtering turns out to be too coarse in practice — recommend shipping Part 1 + 2 first and revisiting only if subscribers actually ask for finer control.

## Suggested build order

1. Part 1 (calendar feed UI) — no migration, immediately useful, almost free given the backend already exists.
2. Part 2 (email digest filtering) — one migration, one new form, one loop change.
3. Part 3 — only if there's real demand for finer-than-region location filtering; needs a geocoding decision first.
