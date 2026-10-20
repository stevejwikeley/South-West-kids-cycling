import { test } from "node:test";
import assert from "node:assert/strict";
import { assessMatch, organiserSignal, venueSignal, type DedupFields } from "./ingestion/dedup-score.ts";

const ev = (over: Partial<DedupFields>): DedupFields => ({
  title: "SWCX League Round 9 – Newnham Bottom (Regional Championships)",
  date: "2026-12-06",
  venue_name: "Newnham Bottom",
  postcode: null,
  organiser_name: "South West Cyclocross League",
  club_id: null,
  kind: "race",
  ...over,
});

test("reworded title and organiser on the same date match", () => {
  const live = ev({});
  const scanned = ev({
    title: "SWCX League 2026/27 Round 9 — Regional Championships, Newnham Bottom, Plymouth",
    organiser_name: "South West Cyclo-Cross League (hosted by Dartmoor Velo)",
  });
  assert.equal(assessMatch(scanned, live).verdict, "match");
});

test("different round numbers never match", () => {
  const r9 = ev({});
  const r10 = ev({ title: "SWCX League Round 10 – Newnham Bottom", date: "2026-12-07" });
  assert.equal(assessMatch(r10, r9).verdict, "no");
});

test("organiser name prefixed onto the title still matches", () => {
  const a = ev({ title: "Indoor Session", date: "2026-11-05", venue_name: null, organiser_name: "Wheal Velocity" });
  const b = ev({ title: "Wheal Velocity Indoor Session", date: "2026-11-05", venue_name: null, organiser_name: "Wheal Velocity" });
  assert.equal(assessMatch(a, b).verdict, "match");
});

test("venue change with same name, organiser and date still matches", () => {
  const live = ev({});
  const moved = ev({ venue_name: "Plymouth Life Centre Field" });
  assert.equal(assessMatch(moved, live).verdict, "match");
});

test("a postponed race is flagged as a possible reschedule, not auto-matched", () => {
  const live = ev({});
  const moved = ev({ date: "2026-12-20" });
  assert.equal(assessMatch(moved, live).verdict, "reschedule");
});

test("a moved date with a different organiser is not a reschedule", () => {
  const live = ev({});
  const other = ev({ date: "2026-12-20", organiser_name: "Torbay CC" });
  assert.equal(assessMatch(other, live).verdict, "no");
});

test("weekly training on a different date is a different session", () => {
  const a = ev({ title: "Wheal Velocity Outdoor Training – Road Bike Focus", date: "2026-10-17", venue_name: "Wheal Velocity Clubhouse", organiser_name: "Wheal Velocity", kind: "training" });
  const b = { ...a, date: "2026-10-31" };
  assert.equal(assessMatch(a, b).verdict, "no");
});

test("next season's edition is outside the reschedule window", () => {
  assert.equal(assessMatch(ev({ date: "2027-12-05" }), ev({})).verdict, "no");
});

test("undated listings only match other undated listings", () => {
  const a = ev({ title: "Taw Velo Youth Academy – Weekly Saturday Training", date: null, venue_name: null, organiser_name: "Taw Velo" });
  assert.equal(assessMatch(a, { ...a, title: "Taw Velo Youth Academy Saturday Training" }).verdict, "match");
  assert.equal(assessMatch(a, ev({})).verdict, "no");
});

test("organiser signal ignores generic words", () => {
  assert.equal(organiserSignal(ev({ organiser_name: "Exeter Wheelers CC" }), ev({ organiser_name: "Bristol CC" })), false);
  assert.equal(organiserSignal(ev({ organiser_name: "Taw Velo" }), ev({ organiser_name: "Taw Velo Cycling Club" })), true);
  assert.equal(organiserSignal(ev({ organiser_name: null }), ev({})), null);
  assert.equal(organiserSignal(ev({ club_id: "a" }), ev({ club_id: "b", organiser_name: "South West Cyclocross League" })), false);
});

test("venue signal uses postcode and tolerates a longer venue name", () => {
  assert.equal(venueSignal(ev({ venue_name: "Newnham Bottom Field" }), ev({})), true);
  assert.equal(venueSignal(ev({ venue_name: "Site A", postcode: "pl7 4ss" }), ev({ venue_name: "Site B", postcode: "PL7 4SS" })), true);
  assert.equal(venueSignal(ev({ venue_name: "Escot Park" }), ev({})), false);
  assert.equal(venueSignal(ev({ venue_name: null }), ev({})), null);
});
