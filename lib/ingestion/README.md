# Smart ingestion

This is the AI-assisted pipeline that turns unstructured input (a URL, pasted text, a poster image, a spreadsheet) into candidate events in the admin pending queue. It never publishes anything directly — every candidate still needs a human to approve it in `/admin/pending`.

## Entry points

There are two ways in, and they both end up calling the same shared functions below so dedup and save behavior is identical either way:

- **Manual** — an admin uses `/admin/ingest` (paste a URL/text, or upload a file/image). Handled by `ingestTextOrUrl` / `ingestFile` in `lib/actions/ingest.ts`.
- **Watched sources** — the nightly cron (`/api/cron/check-sources`) or an admin's "check now" button calls `checkWatchedSource()` (`check-source.ts`) for each row in `watched_sources`.

## Pipeline

```
input (URL / text / image / file)
  │
  ├─ URL → fetch() → html-to-text.ts → plain text (links preserved inline as "text (URL)")
  │
  ▼
extract-events.ts — extractEvents({ text } | { image })
  Claude (claude-opus-5), structured output via zodOutputFormat, one call per source.
  Returns ExtractedEvent[]: title, discipline, date, venue, region, age
  categories, booking info, a confidence score (0-1), and low_confidence_fields
  (populated-but-uncertain fields, distinct from fields left null).
  │
  ▼
dedup.ts — findDuplicate()
  Fuzzy title + venue match within ±3 days against live events AND
  already-queued smart_ingest pending rows, so re-scanning a watched source
  before its last batch is reviewed doesn't flood the queue with repeats.
  │
  ▼
save-candidates.ts — saveCandidates()
  Inserts non-duplicate candidates into events_pending with source_type:
  "smart_ingest", the confidence score, field_flags (from
  low_confidence_fields, surfaced in the admin UI as "needs verification"),
  and duplicate_of set when it matched a live event (used as the merge
  target on approval).
```

## Extraction rules worth knowing

The system prompt in `extract-events.ts` encodes several non-obvious decisions — read it before changing extraction behavior, but the short version:

- Only extracts events dated today or later, and only youth/junior cycling (or club coaching sessions) in Devon/Cornwall.
- Leaves a field `null` rather than guessing (an address inferred from a venue name goes in `low_confidence_fields` instead, so a human double-checks it — that's different from just being missing).
- Every event is treated as all-day; no time is ever extracted.
- Age categories default to all five (`u8`–`u16`) if the source doesn't specify — except `gravel`, which defaults to `u12`–`u16` given typical distances.
- When scraping a listing page, links are matched to events by position in the text, not by link text — CTAs like "View event" or "Book now" are usually identical across every row, so proximity is the only reliable signal.

## Confidence tracking (Phase 4)

`field_flags`, `was_edited`, and `watched_sources.published_count`/`corrected_count` (added in `0007_phase4_confidence_tracking.sql`) exist to accumulate data on how often extraction needs correcting, per source. This is data collection only — nothing currently auto-publishes based on it. See the comment at the top of that migration before wiring up an auto-publish path; it's intentionally gated on having enough real correction-rate data first.

## Observability

Both `extractEvents()` and `checkWatchedSource()` are wrapped in Sentry spans (`gen_ai.extract_events`, `ingestion.check_watched_source`) with attributes for input size, token usage, event count, and average confidence — this is the subsystem most likely to fail in an interesting way (a blocked fetch, a degraded source, an API error), so check Sentry traces first when a watched source stops finding events it used to.
