import { test } from "node:test";
import assert from "node:assert/strict";
import { canAutoPublish, missingForPublish } from "./ingestion/publish-ready.ts";

const complete = {
  title: "SWCX Round 4",
  discipline: "cyclocross",
  start_datetime: "2026-11-01T00:00:00.000Z",
  venue_name: "Cornwall Showground",
  region: "cornwall",
  organiser_url: "https://example.com",
  kind: "race",
  club_id: null,
  duplicate_of: null,
  field_flags: null,
};

test("a complete new event publishes", () => {
  assert.deepEqual(missingForPublish(complete), []);
  assert.equal(canAutoPublish(complete), true);
});

test("a new event missing a required field stays queued and says why", () => {
  const row = { ...complete, start_datetime: null, venue_name: "" };
  assert.deepEqual(missingForPublish(row), ["start_datetime", "venue_name"]);
  assert.equal(canAutoPublish(row), false);
});

test("training without a club stays queued", () => {
  const row = { ...complete, kind: "training" };
  assert.deepEqual(missingForPublish(row), ["club"]);
  assert.equal(canAutoPublish({ ...row, club_id: "club-1" }), true);
});

test("flags don't hold back a complete new event", () => {
  assert.equal(canAutoPublish({ ...complete, field_flags: { region: "needs verification" } }), true);
});

test("an update publishes only when nothing is flagged", () => {
  const update = { duplicate_of: "live-1", title: null, field_flags: null };
  assert.equal(canAutoPublish(update), true);
  assert.equal(canAutoPublish({ ...update, field_flags: {} }), true);
  assert.equal(canAutoPublish({ ...update, field_flags: { address: "needs verification" } }), false);
});
