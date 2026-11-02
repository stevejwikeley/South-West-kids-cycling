import { describe, expect, it } from "vitest";
import { safeActionRedirect, safeNextPath } from "./safe-next";

describe("safeNextPath", () => {
  it("keeps same-site relative paths", () => {
    expect(safeNextPath("/organiser")).toBe("/organiser");
    expect(safeNextPath("/admin/pending?x=1")).toBe("/admin/pending?x=1");
  });

  it.each(["@evil.com", "//evil.com", "/\\evil.com", "https://evil.com", "admin", ""])(
    "falls back for %j",
    (bad) => {
      expect(safeNextPath(bad)).toBe("/admin");
    }
  );

  it("falls back for missing values and honours a custom fallback", () => {
    expect(safeNextPath(null)).toBe("/admin");
    expect(safeNextPath(undefined, "/organiser")).toBe("/organiser");
  });
});

describe("safeActionRedirect", () => {
  it.each(["/admin", "/admin/pending", "/organiser"])("allows %j", (ok) => {
    expect(safeActionRedirect(ok)).toBe(ok);
  });

  it.each(["https://evil.example", "//evil.example", "/admin/../evil", "/login", "", null, 42])(
    "falls back for %j",
    (bad) => {
      expect(safeActionRedirect(bad)).toBe("/");
    }
  );
});
