import { test } from "node:test";
import assert from "node:assert/strict";
import {
  weekdayPattern,
  groupByClub,
  sessionsInNextDays,
  nextDistinctDates,
  distinctDates,
  commonVenue,
} from "./training.ts";

const s = (id: string, date: string, clubId = "club-a") => ({
  id,
  title: "Junior Academy",
  date,
  venue: "Wheal Jane",
  clubId,
});

// 2026-09-12, -19 and -26 are Saturdays; 2026-09-17 is a Thursday.

test("weekdayPattern names a single weekday", () => {
  assert.equal(weekdayPattern([s("1", "2026-09-12"), s("2", "2026-09-19")]), "Saturdays");
});

test("weekdayPattern joins two weekdays in week order", () => {
  assert.equal(
    weekdayPattern([s("1", "2026-09-19"), s("2", "2026-09-17")]),
    "Thursdays & Saturdays"
  );
});

test("weekdayPattern returns null for irregular dates", () => {
  assert.equal(
    weekdayPattern([s("1", "2026-09-14"), s("2", "2026-09-16"), s("3", "2026-09-19")]),
    null
  );
});

test("weekdayPattern returns null for an empty list", () => {
  assert.equal(weekdayPattern([]), null);
});

test("groupByClub keys sessions by club id", () => {
  const grouped = groupByClub([s("c", "2026-09-26", "x"), s("b", "2026-09-19", "y"), s("a", "2026-09-12", "x")]);
  assert.deepEqual(grouped.get("x")?.map((v) => v.id), ["a", "c"]);
  assert.deepEqual(grouped.get("y")?.map((v) => v.id), ["b"]);
});

test("sessionsInNextDays covers today through the last day inclusive", () => {
  const out = sessionsInNextDays(
    [s("last", "2026-09-18"), s("after", "2026-09-19"), s("today", "2026-09-12"), s("past", "2026-09-11")],
    "2026-09-12",
    7
  );
  assert.deepEqual(out.map((x) => x.id), ["today", "last"]);
});

test("nextDistinctDates collapses two sessions on the same date into one", () => {
  const out = nextDistinctDates(
    [s("a", "2026-09-17"), s("b", "2026-09-19"), s("c", "2026-09-19"), s("d", "2026-09-24")],
    "2026-09-13",
    3
  );
  assert.deepEqual(out, ["2026-09-17", "2026-09-19", "2026-09-24"]);
});

test("nextDistinctDates returns up to n distinct dates in ascending order", () => {
  const out = nextDistinctDates(
    [s("a", "2026-09-26"), s("b", "2026-09-12"), s("c", "2026-09-19")],
    "2026-09-10",
    2
  );
  assert.deepEqual(out, ["2026-09-12", "2026-09-19"]);
});

test("nextDistinctDates deduplicates non-adjacent dates in unsorted input", () => {
  const out = nextDistinctDates(
    [s("a", "2026-09-24"), s("b", "2026-09-19"), s("c", "2026-09-17"), s("d", "2026-09-19")],
    "2026-09-13",
    4
  );
  assert.deepEqual(out, ["2026-09-17", "2026-09-19", "2026-09-24"]);
});

test("nextDistinctDates excludes dates before today", () => {
  const out = nextDistinctDates([s("a", "2026-09-01")], "2026-09-12", 3);
  assert.deepEqual(out, []);
});

test("nextDistinctDates returns an empty list for an empty input", () => {
  assert.deepEqual(nextDistinctDates([], "2026-09-12", 3), []);
});

test("distinctDates deduplicates two sessions on the same date", () => {
  const out = distinctDates([s("a", "2026-09-17"), s("b", "2026-09-19"), s("c", "2026-09-19")]);
  assert.deepEqual(out, ["2026-09-17", "2026-09-19"]);
});

test("commonVenue returns the venue when every session shares it", () => {
  assert.equal(
    commonVenue([s("a", "2026-09-17", "club-a"), s("b", "2026-09-19", "club-a")]),
    "Wheal Jane"
  );
});

test("commonVenue returns null when venues differ", () => {
  const clubhouse = { ...s("a", "2026-09-17"), venue: "Wheal Velocity clubhouse" };
  const earthSciencePark = { ...s("b", "2026-09-19"), venue: "Wheal Jane Earth Science Park" };
  assert.equal(commonVenue([clubhouse, earthSciencePark]), null);
});

test("commonVenue returns null for an empty list", () => {
  assert.equal(commonVenue([]), null);
});
