// Pure helper, imports nothing but ./mock-data.ts and an erased `import
// type` — loads directly under `node --test --experimental-strip-types`,
// same as mock-data.test.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { visibleDisciplinesFor } from "./visible-disciplines.ts";
import { EVENT_DISCIPLINES, eventDisc } from "./mock-data.ts";
import type { DisciplineId } from "./types.ts";

// I1: components/CalendarPage.tsx used to build its filter chips by
// intersecting EVENT_DISCIPLINES with the disciplines present in the data
// (`EVENT_DISCIPLINES.filter((d) => present.has(d.id))`). An event whose
// discipline isn't in the curated list got no chip at all — it rendered
// fine unfiltered, then vanished with no way back the moment any filter was
// applied. This is the pure derivation extracted out of that component so
// the fix can be tested without a DOM.
test("a discipline present in the data gets a chip even when EVENT_DISCIPLINES doesn't know it", () => {
  const unknownId = "future-discipline-xyz" as DisciplineId;
  const result = visibleDisciplinesFor(["cx", unknownId]);
  const ids = result.map((d) => d.id);

  assert.ok(ids.includes(unknownId), `expected a chip for ${unknownId}, got: ${ids.join(", ")}`);
  const chip = result.find((d) => d.id === unknownId)!;
  assert.deepEqual(chip, eventDisc(unknownId));
});

test("known disciplines keep EVENT_DISCIPLINES' curated order; unknown ones are appended after", () => {
  const unknownId = "future-discipline-xyz" as DisciplineId;
  // Deliberately out of curated order and with the unknown id in the middle
  // of the input — the output order must not just mirror input order.
  const result = visibleDisciplinesFor(["training", unknownId, "cx"]);

  assert.deepEqual(
    result.map((d) => d.id),
    ["cx", "training", unknownId]
  );
});

test("only disciplines actually present in the data are returned — no phantom chips", () => {
  const result = visibleDisciplinesFor(["cx"]);
  assert.deepEqual(result.map((d) => d.id), ["cx"]);
});

test("duplicate events of the same discipline produce one chip, not one per event", () => {
  const result = visibleDisciplinesFor(["cx", "cx", "cx"]);
  assert.deepEqual(result.map((d) => d.id), ["cx"]);
});

test("an empty event list produces no chips", () => {
  assert.deepEqual(visibleDisciplinesFor([]), []);
});

test("every real discipline (including coaching) round-trips as a known, curated chip", () => {
  for (const d of EVENT_DISCIPLINES) {
    const [chip] = visibleDisciplinesFor([d.id]);
    assert.deepEqual(chip, d);
  }
});
