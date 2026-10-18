import { test } from "node:test";
import assert from "node:assert/strict";
import {
  borrowFromKnownVenue,
  checkPostcode,
  findKnownVenue,
  regionFromPostcode,
  type KnownVenue,
  type LocationFields,
} from "./ingestion/enrich-location.ts";

const known: KnownVenue[] = [
  { venue_name: "Newnham Bottom Field", postcode: "PL7 5BN", address: "Newnham Park, Plympton", region: "devon", club_id: null },
  { venue_name: "Perranporth Beach", postcode: "TR6 0EY", address: "Perranporth", region: "cornwall", club_id: null },
  { venue_name: "Wheal Jane Earth Science Park", postcode: "TR3 6EH", address: "Baldhu, Truro", region: "cornwall", club_id: "wv" },
  { venue_name: "Saltash School", postcode: "PL12 4AY", address: null, region: "cornwall", club_id: null },
  { venue_name: "Exeter Bike Park", postcode: "EX2 7AA", address: null, region: "devon", club_id: null },
];

const c = (over: Partial<LocationFields>): LocationFields => ({
  venue_name: null,
  address: null,
  postcode: null,
  region: null,
  club_id: null,
  kind: "race",
  ...over,
});

test("borrows postcode and address from an earlier event at the same venue", () => {
  const r = borrowFromKnownVenue(c({ venue_name: "Newnham Bottom" }), known);
  assert.equal(r.values.postcode, "PL7 5BN");
  assert.equal(r.values.address, "Newnham Park, Plympton");
  assert.equal(r.values.region, "devon");
  assert.match(r.flags.postcode!, /earlier event/);
});

test("never overwrites a postcode or address the source stated", () => {
  const r = borrowFromKnownVenue(c({ venue_name: "Newnham Bottom", postcode: "PL7 1AA", address: "Given" }), known);
  assert.equal(r.values.postcode, "PL7 1AA");
  assert.deepEqual(r.flags, {});
});

test("a shared generic word is not the same venue", () => {
  assert.equal(findKnownVenue(c({ venue_name: "Tavistock School" }), known), null);
  assert.equal(findKnownVenue(c({ venue_name: "Perranporth Airfield" }), known), null);
});

test("a one-word town name doesn't borrow a specific venue's postcode", () => {
  assert.equal(findKnownVenue(c({ venue_name: "Exeter" }), known), null);
});

test("club training with no venue uses the club's one known venue", () => {
  const r = borrowFromKnownVenue(c({ club_id: "wv", kind: "training" }), known);
  assert.equal(r.values.postcode, "TR3 6EH");
  assert.equal(r.values.venue_name, "Wheal Jane Earth Science Park");
  assert.ok(r.flags.venue_name);
});

test("no guess when earlier events at the venue disagree on postcode", () => {
  const conflicting = [...known, { ...known[0], postcode: "PL7 9ZZ" }];
  assert.equal(findKnownVenue(c({ venue_name: "Newnham Bottom Field" }), conflicting), null);
});

test("region comes from the postcode's council area", () => {
  assert.equal(regionFromPostcode({ admin_county: null, admin_district: "Cornwall" }), "cornwall");
  assert.equal(regionFromPostcode({ admin_county: null, admin_district: "Plymouth" }), "devon");
  assert.equal(regionFromPostcode({ admin_county: "Devon", admin_district: "East Devon" }), "devon");
  assert.equal(regionFromPostcode({ admin_county: null, admin_district: "North Somerset" }), "somerset");
  assert.equal(regionFromPostcode({ admin_county: null, admin_district: "Bristol, City of" }), "bristol");
  assert.equal(regionFromPostcode({ admin_county: null, admin_district: "Dorset" }), null);
});

test("a matching postcode clears the region flag; a mismatch raises it", () => {
  const cornwall = { admin_county: null, admin_district: "Cornwall" };
  assert.deepEqual(checkPostcode(c({ postcode: "TR3 6EH", region: "cornwall" }), cornwall).flags, { region: null });
  assert.equal(checkPostcode(c({ postcode: "TR3 6EH" }), cornwall).values.region, "cornwall");
  assert.match(checkPostcode(c({ postcode: "TR3 6EH", region: "devon" }), cornwall).flags.region!, /cornwall/);
  assert.deepEqual(checkPostcode(c({ postcode: "TR3 6EH", region: "both" }), cornwall).flags, { region: null });
});

test("an unknown postcode is flagged", () => {
  assert.match(checkPostcode(c({ postcode: "ZZ9 9ZZ" }), null).flags.postcode!, /not a recognised/);
});
