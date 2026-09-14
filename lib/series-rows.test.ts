import { test } from "node:test";
import assert from "node:assert/strict";
import {
  occurrenceInsertRow,
  seriesInsertRow,
  seriesUpdateRow,
  eventsPropagateUpdateRow,
  type SeriesFormValuesWithCoords,
} from "./series-rows.ts";

// A minimal but complete set of form values, standing in for what
// parseSeriesForm returns. club_id is set (as it must be for a training
// series — the DB rejects training with no club) so we can assert it
// survives the row builders untouched.
//
// No `as` cast here: the returned literal is checked structurally against
// SeriesFormValuesWithCoords, so a field added to EventSeriesFormValues
// that this fixture doesn't supply is a tsc error, not a silent gap.
function baseValues(overrides: Partial<SeriesFormValuesWithCoords> = {}): SeriesFormValuesWithCoords {
  return {
    title: "Junior Academy",
    discipline: "road",
    status: "confirmed",
    kind: "race",
    weekdays: [2, 4],
    start_date: "2026-09-15",
    until_date: "2026-12-15",
    venue_name: "Wheal Jane",
    address: null,
    postcode: null,
    region: "devon",
    age_categories: ["u12"],
    // Deliberately false and distinct from the other boolean constants the
    // builders hard-code (all_day: true, approved: true) so a mutation that
    // swaps one of those for `values.kids_only` shows up as a value change,
    // not a coincidental match.
    kids_only: false,
    booking_status: "planned",
    booking_link: null,
    organiser_url: "https://example.org",
    organiser_name: null,
    organiser_contact: null,
    club_id: "club-123",
    description: null,
    lat: 50.1,
    lng: -5.1,
    ...overrides,
  };
}

// Obviously distinct from each other so a mutation that swaps one for the
// other (e.g. `created_by: seriesId`) is visible as a value mismatch rather
// than two equal-looking strings.
const userId = "user-abc";
const seriesId = "series-xyz";

// Deliberately different from start_date so a mutation that derives
// start_datetime from values.start_date instead of occurrenceDate is
// visible — every occurrence in a series would otherwise wrongly collapse
// onto the series' own start date.
const occurrenceDate = "2026-09-17";

// --- occurrenceInsertRow -----------------------------------------------

const occurrenceInsertRowKeys = [
  "address",
  "age_categories",
  "all_day",
  "approved",
  "booking_link",
  "booking_status",
  "club_id",
  "created_by",
  "description",
  "discipline",
  "end_datetime",
  "kids_only",
  "kind",
  "lat",
  "lng",
  "occurrence_date",
  "organiser_contact",
  "organiser_name",
  "organiser_url",
  "postcode",
  "region",
  "series_detached",
  "series_id",
  "source_type",
  "start_datetime",
  "status",
  "title",
  "venue_name",
];

test("occurrenceInsertRow has exactly the expected keys", () => {
  const row = occurrenceInsertRow(baseValues(), seriesId, occurrenceDate, userId);
  assert.deepEqual(Object.keys(row).sort(), occurrenceInsertRowKeys);
});

test("occurrenceInsertRow carries kind through for race and training", () => {
  assert.equal(occurrenceInsertRow(baseValues({ kind: "race" }), seriesId, occurrenceDate, userId).kind, "race");
  assert.equal(
    occurrenceInsertRow(baseValues({ kind: "training" }), seriesId, occurrenceDate, userId).kind,
    "training"
  );
});

test("occurrenceInsertRow carries club_id through", () => {
  const row = occurrenceInsertRow(baseValues({ club_id: "club-999" }), seriesId, occurrenceDate, userId);
  assert.equal(row.club_id, "club-999");
});

test("occurrenceInsertRow sets the occurrence-specific identity fields", () => {
  const row = occurrenceInsertRow(baseValues(), seriesId, occurrenceDate, userId);
  assert.equal(row.series_id, seriesId);
  assert.equal(row.occurrence_date, occurrenceDate);
  assert.equal(row.series_detached, false);
  assert.equal(row.all_day, true);
  // Derived from occurrenceDate specifically, not the series' start_date
  // (which is a different date in this fixture).
  assert.equal(row.start_datetime, "2026-09-17T00:00:00.000Z");
  assert.notEqual(row.start_datetime, "2026-09-15T00:00:00.000Z");
});

test("occurrenceInsertRow sets the manual/auto-approved constants and per-user/id fields", () => {
  const row = occurrenceInsertRow(baseValues(), seriesId, occurrenceDate, userId);
  assert.equal(row.source_type, "manual");
  assert.equal(row.approved, true);
  assert.equal(row.end_datetime, null);
  assert.equal(row.created_by, userId);
  assert.notEqual(row.created_by, seriesId);
});

// --- seriesInsertRow -----------------------------------------------------

const seriesInsertRowKeys = [
  "address",
  "age_categories",
  "approved",
  "booking_link",
  "booking_status",
  "club_id",
  "created_by",
  "description",
  "discipline",
  "kids_only",
  "kind",
  "lat",
  "lng",
  "organiser_contact",
  "organiser_name",
  "organiser_url",
  "postcode",
  "region",
  "start_date",
  "status",
  "title",
  "until_date",
  "venue_name",
  "weekdays",
];

test("seriesInsertRow has exactly the expected keys", () => {
  const row = seriesInsertRow(baseValues(), userId);
  assert.deepEqual(Object.keys(row).sort(), seriesInsertRowKeys);
});

test("seriesInsertRow carries kind through for race and training", () => {
  assert.equal(seriesInsertRow(baseValues({ kind: "race" }), userId).kind, "race");
  assert.equal(seriesInsertRow(baseValues({ kind: "training" }), userId).kind, "training");
});

test("seriesInsertRow carries club_id through", () => {
  const row = seriesInsertRow(baseValues({ club_id: "club-999" }), userId);
  assert.equal(row.club_id, "club-999");
});

test("seriesInsertRow sets approved and created_by", () => {
  const row = seriesInsertRow(baseValues(), userId);
  assert.equal(row.approved, true);
  assert.equal(row.created_by, userId);
  assert.notEqual(row.created_by, seriesId);
});

// --- seriesUpdateRow -------------------------------------------------------

const seriesUpdateRowKeys = [
  "address",
  "age_categories",
  "booking_link",
  "booking_status",
  "club_id",
  "description",
  "discipline",
  "kids_only",
  "kind",
  "lat",
  "lng",
  "organiser_contact",
  "organiser_name",
  "organiser_url",
  "postcode",
  "region",
  "start_date",
  "status",
  "title",
  "until_date",
  "updated_by",
  "venue_name",
  "weekdays",
];

test("seriesUpdateRow has exactly the expected keys (no approved, no created_by)", () => {
  const row = seriesUpdateRow(baseValues(), userId);
  assert.deepEqual(Object.keys(row).sort(), seriesUpdateRowKeys);
});

test("seriesUpdateRow carries kind through for race and training", () => {
  assert.equal(seriesUpdateRow(baseValues({ kind: "race" }), userId).kind, "race");
  assert.equal(seriesUpdateRow(baseValues({ kind: "training" }), userId).kind, "training");
});

test("seriesUpdateRow carries club_id through", () => {
  const row = seriesUpdateRow(baseValues({ club_id: "club-999" }), userId);
  assert.equal(row.club_id, "club-999");
});

test("seriesUpdateRow sets updated_by to the user id", () => {
  const row = seriesUpdateRow(baseValues(), userId);
  assert.equal(row.updated_by, userId);
  assert.notEqual(row.updated_by, seriesId);
});

// --- eventsPropagateUpdateRow ---------------------------------------------

const eventsPropagateUpdateRowKeys = [
  "address",
  "age_categories",
  "booking_link",
  "booking_status",
  "club_id",
  "description",
  "discipline",
  "kids_only",
  "kind",
  "lat",
  "lng",
  "organiser_contact",
  "organiser_name",
  "organiser_url",
  "postcode",
  "region",
  "status",
  "title",
  "updated_by",
  "venue_name",
];

test("eventsPropagateUpdateRow has exactly the expected keys (no per-occurrence identity fields)", () => {
  const row = eventsPropagateUpdateRow(baseValues(), userId);
  assert.deepEqual(Object.keys(row).sort(), eventsPropagateUpdateRowKeys);
  // Explicitly confirm the per-occurrence identity fields this builder must
  // never touch are absent, per the comment at lib/series-rows.ts:115-119 —
  // an UPDATE only changes keys you pass, so any of these appearing here
  // (even set to a value that looks correct) would silently stamp over a
  // detached occurrence's own start_datetime/series_detached.
  for (const forbidden of ["start_datetime", "occurrence_date", "series_id", "series_detached"]) {
    assert.equal(forbidden in row, false, `${forbidden} must not appear in eventsPropagateUpdateRow`);
  }
});

test("eventsPropagateUpdateRow carries kind through for race and training", () => {
  assert.equal(eventsPropagateUpdateRow(baseValues({ kind: "race" }), userId).kind, "race");
  assert.equal(eventsPropagateUpdateRow(baseValues({ kind: "training" }), userId).kind, "training");
});

test("eventsPropagateUpdateRow carries club_id through", () => {
  const row = eventsPropagateUpdateRow(baseValues({ club_id: "club-999" }), userId);
  assert.equal(row.club_id, "club-999");
});

test("eventsPropagateUpdateRow sets updated_by to the user id", () => {
  const row = eventsPropagateUpdateRow(baseValues(), userId);
  assert.equal(row.updated_by, userId);
  assert.notEqual(row.updated_by, seriesId);
});
