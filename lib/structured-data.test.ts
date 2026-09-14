// structured-data.ts's own runtime import was switched from "@/lib/mock-data"
// to the relative "./mock-data.ts" (tsconfig already has
// allowImportingTsExtensions: true) specifically so this file could be
// loaded directly under `node --test --experimental-strip-types`, the same
// way lib/mock-data.ts and lib/training.ts already are — verified:
// `node --experimental-strip-types -e "import('./lib/structured-data.ts')"`
// loads cleanly and resolves to the same module Next.js's bundler resolves.
import { test } from "node:test";
import assert from "node:assert/strict";
import { eventsToJsonLd } from "./structured-data.ts";
import type { CalendarEvent } from "./types.ts";

function baseEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "evt-1",
    title: "Test CX Race",
    discipline: "cx",
    kind: "race",
    date: "2026-10-04",
    venue: "Wheal Jane",
    address: null,
    postcode: null,
    lat: null,
    lng: null,
    region: "devon",
    status: "confirmed",
    kidsOnly: true,
    ages: ["u10", "u12"],
    bookingStatus: "planned",
    booking: null,
    organiserUrl: "https://example.org",
    seriesId: null,
    bookable: false,
    clubId: null,
    ...overrides,
  };
}

// I2: a region_type/event_status value this deployment's label maps don't
// know about (the same kind of drift that took the discipline path down on
// 2026-09-13) must degrade to a sane default, not interpolate the literal
// string "undefined" into the JSON-LD published on the public home page and
// read by Google's Event rich results.
test("eventsToJsonLd falls back to a safe region label instead of rendering 'undefined'", () => {
  const unknownRegion = "wales" as CalendarEvent["region"];
  const [jsonLd] = eventsToJsonLd([baseEvent({ region: unknownRegion })]);

  assert.equal(jsonLd.location.address.addressRegion, "South West England");
  assert.ok(!jsonLd.description.includes("undefined"), `description contained "undefined": ${jsonLd.description}`);
  assert.ok(jsonLd.description.includes("South West England"));
});

test("eventsToJsonLd falls back to a safe event status instead of rendering 'undefined'", () => {
  const unknownStatus = "postponed" as CalendarEvent["status"];
  const [jsonLd] = eventsToJsonLd([baseEvent({ status: unknownStatus })]);

  assert.equal(jsonLd.eventStatus, "https://schema.org/EventScheduled");
});

test("eventsToJsonLd still uses the real label for a known region/status", () => {
  const [jsonLd] = eventsToJsonLd([baseEvent({ region: "cornwall", status: "cancelled" })]);

  assert.equal(jsonLd.location.address.addressRegion, "Cornwall");
  assert.equal(jsonLd.eventStatus, "https://schema.org/EventCancelled");
});
