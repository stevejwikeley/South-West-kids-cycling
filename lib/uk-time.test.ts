import { describe, expect, it } from "vitest";
import { ukDateOf, ukLocalToUtcIso, ukMidnightUtcIso, utcIsoToUkLocalParts } from "./uk-time";

describe("ukDateOf", () => {
  it("puts a timed event just after midnight BST on the UK day, not the UTC day", () => {
    expect(ukDateOf("2026-06-13T23:30:00.000Z")).toBe("2026-06-14"); // 00:30 BST
  });

  it("leaves late-evening GMT events on the same day", () => {
    expect(ukDateOf("2026-12-13T23:30:00.000Z")).toBe("2026-12-13");
  });

  it("keeps all-day (midnight UTC) rows on their day in both seasons", () => {
    expect(ukDateOf(ukMidnightUtcIso("2026-07-01"))).toBe("2026-07-01");
    expect(ukDateOf("2026-07-01T00:00:00+00:00")).toBe("2026-07-01");
    expect(ukDateOf(ukMidnightUtcIso("2026-01-15"))).toBe("2026-01-15");
  });
});

describe("ukLocalToUtcIso", () => {
  it("subtracts an hour in BST", () => {
    expect(ukLocalToUtcIso("2026-06-14", "09:00")).toBe("2026-06-14T08:00:00.000Z");
  });

  it("is unchanged in GMT", () => {
    expect(ukLocalToUtcIso("2026-12-14", "09:00")).toBe("2026-12-14T09:00:00.000Z");
  });

  it("round-trips through utcIsoToUkLocalParts", () => {
    expect(utcIsoToUkLocalParts(ukLocalToUtcIso("2026-06-14", "00:30"))).toEqual({ date: "2026-06-14", time: "00:30" });
    expect(utcIsoToUkLocalParts(ukLocalToUtcIso("2026-11-02", "18:45"))).toEqual({ date: "2026-11-02", time: "18:45" });
  });
});
