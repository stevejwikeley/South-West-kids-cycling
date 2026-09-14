// Pure lookups — mock-data.ts imports nothing but erased `import type`, so
// this runs directly under `node --test --experimental-strip-types` with no
// bundler in the loop (verified: `node --experimental-strip-types -e
// "import('./lib/mock-data.ts')"` loads cleanly).
import { test } from "node:test";
import assert from "node:assert/strict";
import { eventDisc, clubDisc, EVENT_DISCIPLINES } from "./mock-data.ts";
import type { DisciplineId } from "./types.ts";

test("eventDisc returns the real label and colour for a known discipline", () => {
  const d = eventDisc("cx");
  assert.equal(d.label, "Cyclocross");
  assert.equal(d.color, "#E0102A");
});

// The production incident: a migration set discipline = 'training' on live
// rows before the deployed code's EVENT_DISCIPLINES list knew about it (here
// simulated with an id no version of the list will ever contain). The old
// `.find(...)!` threw when the caller read `.color` off `undefined`, which
// 500'd every page that renders an event. eventDisc must degrade instead.
test("eventDisc returns a usable fallback for an unrecognised discipline instead of throwing", () => {
  const unknownId = "future-discipline-xyz" as DisciplineId;
  const d = eventDisc(unknownId);
  assert.equal(d.id, unknownId);
  assert.equal(typeof d.label, "string");
  assert.ok(d.label.length > 0);
  assert.equal(typeof d.color, "string");
  assert.ok(/^#[0-9A-Fa-f]{6}$/.test(d.color));
});

test("eventDisc's fallback colour does not collide with a real discipline's colour", () => {
  const d = eventDisc("future-discipline-xyz" as DisciplineId);
  for (const real of EVENT_DISCIPLINES) {
    assert.notEqual(d.color, real.color);
  }
});

test("clubDisc returns the real label and colour for a known discipline", () => {
  const d = clubDisc("road");
  assert.equal(d.label, "Road");
  assert.equal(d.color, "#1D3A6B");
});

test("clubDisc returns a usable fallback for an unrecognised discipline instead of throwing", () => {
  const d = clubDisc("future-club-discipline-xyz");
  assert.equal(d.id, "future-club-discipline-xyz");
  assert.equal(typeof d.label, "string");
  assert.ok(d.label.length > 0);
  assert.equal(typeof d.color, "string");
  assert.ok(/^#[0-9A-Fa-f]{6}$/.test(d.color));
});

// Verified live against the discipline_type enum on Supabase project
// mpbptzacxbxadvwnqdol (eu-west-3) on 2026-09-13 via:
//   select enumlabel from pg_enum where enumtypid = 'discipline_type'::regtype
// This is the exact defect that caused the 2026-09-13 outage: 'coaching' was
// added to the live enum, and every hand-written TS union (DisciplineId,
// DisciplineType, EVENT_DISCIPLINES) went on claiming to be exhaustive
// without it. EVENT_DISCIPLINES is the one runtime-enumerable stand-in for
// DisciplineId — this test would have caught 'coaching' going missing (or
// any future drift) the moment someone forgot to update it after a
// migration, rather than leaving it to be discovered by an outage or an
// audit.
const LIVE_DISCIPLINE_TYPE_ENUM = [
  "cx",
  "xc",
  "road",
  "tri",
  "clusters",
  "other",
  "gravel",
  "duathlon",
  "coaching",
  "training",
] as const;

test("EVENT_DISCIPLINES enumerates exactly the live discipline_type enum — no more, no less", () => {
  const declared = new Set(EVENT_DISCIPLINES.map((d) => d.id));
  const live = new Set(LIVE_DISCIPLINE_TYPE_ENUM);

  const missingFromCode = [...live].filter((id) => !declared.has(id));
  const goneFromDb = [...declared].filter((id) => !live.has(id));

  assert.deepEqual(missingFromCode, [], `live enum value(s) not in EVENT_DISCIPLINES: ${missingFromCode.join(", ")}`);
  assert.deepEqual(goneFromDb, [], `EVENT_DISCIPLINES id(s) no longer in the live enum: ${goneFromDb.join(", ")}`);
});
