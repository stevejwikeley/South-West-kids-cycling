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

import { retryWhileTokenFresh } from "./auth-rejection.ts";

test("retries a refused token, then returns the first good answer", async () => {
  const answers = [
    { error: { code: "PGRST303" }, status: 401, data: null },
    { error: { code: "PGRST303" }, status: 401, data: null },
    { error: null, status: 200, data: "profile" },
  ];
  let calls = 0;
  const waits: number[] = [];
  const result = await retryWhileTokenFresh(async () => answers[calls++], { sleep: async (ms) => { waits.push(ms); } });
  assert.equal(result.data, "profile");
  assert.equal(calls, 3);
  assert.deepEqual(waits, [1500, 1500]);
});

test("gives up after the attempt limit and never retries other errors", async () => {
  let calls = 0;
  const refused = await retryWhileTokenFresh(async () => { calls++; return { error: { code: "PGRST303" }, status: 401 }; }, { attempts: 3, sleep: async () => {} });
  assert.equal(refused.error?.code, "PGRST303");
  assert.equal(calls, 3);

  calls = 0;
  await retryWhileTokenFresh(async () => { calls++; return { error: { code: "PGRST116" }, status: 406 }; }, { sleep: async () => {} });
  assert.equal(calls, 1); // "no such row" is a real answer
});
