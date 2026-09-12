import { test } from "node:test";
import assert from "node:assert/strict";
import { weekdayPattern, nextSessions, groupByClub, sessionsInNextDays } from "./training.ts";

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

test("nextSessions returns the soonest n in date order", () => {
  const out = nextSessions(
    [s("c", "2026-09-26"), s("a", "2026-09-12"), s("b", "2026-09-19")],
    "2026-09-10",
    2
  );
  assert.deepEqual(out.map((x) => x.id), ["a", "b"]);
});

test("nextSessions includes a session dated today", () => {
  const out = nextSessions([s("a", "2026-09-12")], "2026-09-12", 3);
  assert.deepEqual(out.map((x) => x.id), ["a"]);
});

test("nextSessions returns an empty list when nothing is upcoming", () => {
  assert.deepEqual(nextSessions([s("a", "2026-09-01")], "2026-09-12", 3), []);
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
