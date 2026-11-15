import { test } from "node:test";
import assert from "node:assert/strict";
import { isAuthRejection } from "./auth-rejection.ts";

test("treats PostgREST JWT errors and 401s as a refused session", () => {
  assert.equal(isAuthRejection({ code: "PGRST303", status: 401 }), true); // what prod returned on 15 Nov
  assert.equal(isAuthRejection({ code: "PGRST301" }), true);
  assert.equal(isAuthRejection({ code: "PGRST302" }), true);
  assert.equal(isAuthRejection({ status: 401 }), true);
});

test("does not treat other errors as a refused session", () => {
  assert.equal(isAuthRejection(null), false);
  assert.equal(isAuthRejection(undefined), false);
  assert.equal(isAuthRejection({ code: "PGRST116", status: 406 }), false); // .single() found no row
  assert.equal(isAuthRejection({ code: "42501", status: 403 }), false); // permission denied
  assert.equal(isAuthRejection({ code: "PGRST3", status: 400 }), false);
});
