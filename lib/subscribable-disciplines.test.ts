// Pure helper, imports nothing but ./mock-data.ts and an erased `import
// type` — loads directly under `node --test --experimental-strip-types`,
// same as visible-disciplines.test.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { subscribableDisciplinesFor } from "./subscribable-disciplines.ts";
import { EVENT_DISCIPLINES } from "./mock-data.ts";
import type { DisciplineId } from "./types.ts";

// The regression this guards against (commit 3237578, fixed here): /subscribe
// and the embed builder briefly derived their discipline chips from live
// event data, the same way the calendar's visibleDisciplinesFor does. That's
// correct for the calendar, whose chips only ever filter what's on screen
// right now. It's wrong here: these builders produce a *standing feed URL*
// that someone pastes into a calendar app and keeps for months or years. A
// discipline with zero upcoming events today (e.g. every currently-scheduled
// XC race has already lapsed into the past) must still be offered, or nobody
// can ever build an XC feed until a new XC race happens to appear.
test("every curated discipline (bar training) is offered even with zero upcoming events anywhere in the data", () => {
  // Deliberately omits "xc", "road", "clusters", "other" etc. from the live
  // data — none of them currently have an upcoming event.
  const liveIds: DisciplineId[] = ["cx", "tri"];
  const chips = subscribableDisciplinesFor(liveIds);
  const chipIds = chips.map((d) => d.id);

  for (const d of EVENT_DISCIPLINES) {
    if (d.id === "training") continue;
    assert.ok(chipIds.includes(d.id), `curated discipline "${d.id}" must always be offered, got: ${chipIds.join(", ")}`);
  }
});

// This function returns the full curated set, training included — excluding
// training is a policy choice specific to /subscribe and the embed builder
// (see their page.tsx and the comment atop subscribable-disciplines.ts), not
// something a general-purpose "which disciplines exist" helper should decide
// on callers' behalf. Both call sites apply `.filter((d) => d.id !==
// "training")` themselves.
test("training is part of the curated set this function returns — exclusion is the caller's job", () => {
  const chips = subscribableDisciplinesFor([]);
  assert.ok(chips.some((d) => d.id === "training"), "training is a real curated discipline; callers filter it, not this function");
});

// The legitimate half of the finding that produced 3237578 must survive this
// fix: a discipline genuinely present in live data but unknown to the
// curated EVENT_DISCIPLINES list (the exact bug class behind the 2026-09-13
// outage) must still get a chip here, same as it does on the calendar.
test("a discipline present in the data but unknown to the curated list still gets a chip", () => {
  const unknownId = "future-discipline-xyz" as DisciplineId;
  const chips = subscribableDisciplinesFor(["cx", unknownId]);
  const chip = chips.find((d) => d.id === unknownId);
  assert.ok(chip, `expected a chip for ${unknownId}`);
  assert.equal(chip?.label, "Future Discipline Xyz");
});

test("curated disciplines keep EVENT_DISCIPLINES' order regardless of which are live", () => {
  const chips = subscribableDisciplinesFor(["tri"]);
  const curatedIds = chips.filter((d) => d.id !== "training").map((d) => d.id);
  const expected = EVENT_DISCIPLINES.filter((d) => d.id !== "training").map((d) => d.id);
  assert.deepEqual(curatedIds, expected);
});

test("an unknown live discipline is appended after the curated set, not interleaved", () => {
  const unknownId = "future-discipline-xyz" as DisciplineId;
  const chips = subscribableDisciplinesFor([unknownId]);
  assert.equal(chips[chips.length - 1].id, unknownId);
});
