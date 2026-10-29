import { test } from "node:test";
import assert from "node:assert/strict";
import { candidateDiffersFromLive } from "./ingestion/live-diff.ts";
import type { EventRow } from "./supabase/types.ts";

// Shapes taken from the two SWCX rows that kept re-queuing (Oct 2026).
const live = (over: Partial<EventRow> = {}): EventRow =>
  ({
    title: "SWCX League Round 5 – Newnham Top Field",
    discipline: "cyclocross",
    status: "confirmed",
    start_datetime: "2026-11-01T00:00:00+00:00",
    venue_name: "Newnham Top Field",
    address: "Newnham Park, Plymouth",
    postcode: "PL7 5BN",
    region: "devon",
    age_categories: ["u8", "u10"],
    kids_only: false,
    booking_status: "open",
    booking_link: "https://example.org/book",
    organiser_url: "https://swcx.org",
    organiser_name: "South West Cyclocross League / Dartmoor Velo",
    organiser_contact: null,
    description: "Round 5 of the South West Cyclocross League. The youngest riders race first in the morning.",
    club_id: null,
    lat: 50.398633,
    lng: -4.021288,
    ...over,
  }) as unknown as EventRow;

const candidate = (over: Record<string, unknown> = {}) => ({
  ...(live() as unknown as Record<string, unknown>),
  start_datetime: "2026-11-01T00:00:00.000Z",
  ...over,
});

const SAME_SPOT = { lat: 50.398633, lng: -4.021288 };

test("a reworded AI description alone is not a change", () => {
  const c = candidate({ description: "Round 5, with a short 15-minute race for the youngest riders first." });
  assert.equal(candidateDiffersFromLive(c, live(), SAME_SPOT), false);
});

test("organiser written differently but the same organiser is not a change", () => {
  const c = candidate({ organiser_name: "South West Cyclocross League" });
  assert.equal(candidateDiffersFromLive(c, live(), SAME_SPOT), false);
});

test("a genuinely different organiser is a change", () => {
  const c = candidate({ organiser_name: "Exeter Wheelers" });
  assert.equal(candidateDiffersFromLive(c, live(), SAME_SPOT), true);
});

test("a different postcode that geocodes to the same spot is not a change", () => {
  const c = candidate({ postcode: "PL7 5BX" });
  assert.equal(candidateDiffersFromLive(c, live(), SAME_SPOT), false);
});

test("a different postcode at the same named venue is not a change when the live event has no coordinates", () => {
  const c = candidate({ postcode: "PL7 5BX", venue_name: "Newnham Top Field" });
  assert.equal(candidateDiffersFromLive(c, live({ lat: null, lng: null }), SAME_SPOT), false);
});

test("a postcode several km away is a change", () => {
  const c = candidate({ postcode: "EX1 1AA" });
  assert.equal(candidateDiffersFromLive(c, live(), { lat: 50.7236, lng: -3.5275 }), true);
});

test("a different postcode at a differently named venue is a change when distance can't be measured", () => {
  const c = candidate({ postcode: "PL1 2AA", venue_name: "Central Park" });
  assert.equal(candidateDiffersFromLive(c, live({ lat: null, lng: null }), null), true);
});

test("a moved date is still a change", () => {
  const c = candidate({ start_datetime: "2026-11-08T00:00:00.000Z" });
  assert.equal(candidateDiffersFromLive(c, live(), SAME_SPOT), true);
});

test("the same instant in PostgREST's format is not a change", () => {
  assert.equal(candidateDiffersFromLive(candidate(), live(), SAME_SPOT), false);
});
