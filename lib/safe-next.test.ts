import { describe, expect, it } from "vitest";
import { safeNextPath } from "./safe-next";

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
