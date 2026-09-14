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
    region: "south_west",
    age_categories: ["u12"],
    kids_only: true,
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
  } as SeriesFormValuesWithCoords;
}

const userId = "user-abc";
const seriesId = "series-xyz";
const occurrenceDate = "2026-09-15";

// --- occurrenceInsertRow -----------------------------------------------

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
  assert.equal(row.start_datetime, "2026-09-15T00:00:00.000Z");
});

// --- seriesInsertRow -----------------------------------------------------

test("seriesInsertRow carries kind through for race and training", () => {
  assert.equal(seriesInsertRow(baseValues({ kind: "race" }), userId).kind, "race");
  assert.equal(seriesInsertRow(baseValues({ kind: "training" }), userId).kind, "training");
});

test("seriesInsertRow carries club_id through", () => {
  const row = seriesInsertRow(baseValues({ club_id: "club-999" }), userId);
  assert.equal(row.club_id, "club-999");
});

// --- seriesUpdateRow -------------------------------------------------------

test("seriesUpdateRow carries kind through for race and training", () => {
  assert.equal(seriesUpdateRow(baseValues({ kind: "race" }), userId).kind, "race");
  assert.equal(seriesUpdateRow(baseValues({ kind: "training" }), userId).kind, "training");
});

test("seriesUpdateRow carries club_id through", () => {
  const row = seriesUpdateRow(baseValues({ club_id: "club-999" }), userId);
  assert.equal(row.club_id, "club-999");
});

// --- eventsPropagateUpdateRow ---------------------------------------------

test("eventsPropagateUpdateRow carries kind through for race and training", () => {
  assert.equal(eventsPropagateUpdateRow(baseValues({ kind: "race" }), userId).kind, "race");
  assert.equal(eventsPropagateUpdateRow(baseValues({ kind: "training" }), userId).kind, "training");
});

test("eventsPropagateUpdateRow carries club_id through", () => {
  const row = eventsPropagateUpdateRow(baseValues({ club_id: "club-999" }), userId);
  assert.equal(row.club_id, "club-999");
});
