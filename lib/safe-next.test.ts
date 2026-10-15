// Pure function, no imports beyond node:test, so it runs directly under
// `node --test --experimental-strip-types` like the other lib tests.
import { test } from "node:test";
import assert from "node:assert/strict";
import { safeNextPath } from "./safe-next.ts";

test("keeps same-site relative paths", () => {
  assert.equal(safeNextPath("/organiser"), "/organiser");
  assert.equal(safeNextPath("/my-events"), "/my-events");
  assert.equal(safeNextPath("/admin/pending?x=1"), "/admin/pending?x=1");
});

test("falls back for anything that could leave the site", () => {
  for (const bad of ["@evil.com", "//evil.com", "/\\evil.com", "https://evil.com", "admin", ""]) {
    assert.equal(safeNextPath(bad), "/admin", JSON.stringify(bad));
  }
});

test("falls back for missing values and honours a custom fallback", () => {
  assert.equal(safeNextPath(null), "/admin");
  assert.equal(safeNextPath(undefined, "/my-events"), "/my-events");
});
