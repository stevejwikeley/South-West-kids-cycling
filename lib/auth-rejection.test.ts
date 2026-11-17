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

import { fetchWithAuthRetry } from "./auth-rejection.ts";

const refusal = () => new Response(JSON.stringify({ code: "PGRST303", message: "JWT issued at future" }), { status: 401 });
const ok = () => new Response("[]", { status: 200 });
const REST = "https://x.supabase.co/rest/v1/profiles?select=*";

test("retries 'JWT issued at future' on the Data API until it is accepted", async () => {
  const answers = [refusal, refusal, ok];
  let calls = 0;
  const waits: number[] = [];
  const res = await fetchWithAuthRetry(REST, { method: "GET" }, { doFetch: async () => answers[calls++](), sleep: async (ms) => { waits.push(ms); } });
  assert.equal(res.status, 200);
  assert.equal(calls, 3);
  assert.deepEqual(waits, [1000, 2000]);
});

test("gives up after the attempt limit", async () => {
  let calls = 0;
  const res = await fetchWithAuthRetry(REST, undefined, { attempts: 3, doFetch: async () => { calls++; return refusal(); }, sleep: async () => {} });
  assert.equal(res.status, 401);
  assert.equal(calls, 3);
});

test("does not retry other 401s, other endpoints, or streamed bodies", async () => {
  let calls = 0;
  const expired = async () => { calls++; return new Response(JSON.stringify({ code: "PGRST303", message: "JWT expired" }), { status: 401 }); };
  await fetchWithAuthRetry(REST, undefined, { doFetch: expired, sleep: async () => {} });
  assert.equal(calls, 1); // an expired token will not heal by waiting

  calls = 0;
  await fetchWithAuthRetry("https://x.supabase.co/auth/v1/user", undefined, { doFetch: async () => { calls++; return refusal(); }, sleep: async () => {} });
  assert.equal(calls, 1);

  calls = 0;
  await fetchWithAuthRetry(REST, { method: "POST", body: new ReadableStream() }, { doFetch: async () => { calls++; return refusal(); }, sleep: async () => {} });
  assert.equal(calls, 1);
});