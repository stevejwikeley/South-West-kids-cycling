import { describe, expect, it, vi } from "vitest";
import { buildCalendar } from "./calendar-ics";
import type { PublicEventRow } from "@/lib/supabase/columns";

function row(overrides: Partial<PublicEventRow> = {}): PublicEventRow {
  return {
    id: "11111111-0000-0000-0000-000000000001",
    title: "Torbay CX Round 3",
    discipline: "cx",
    status: "confirmed",
    start_datetime: "2026-11-08T00:00:00+00:00",
    end_datetime: null,
    all_day: true,
    venue_name: "Clennon Valley",
    address: null,
    postcode: null,
    lat: null,
    lng: null,
    age_categories: ["u8"],
    kids_only: true,
    booking_status: "planned",
    booking_link: null,
    organiser_url: "https://example.org",
    organiser_name: null,
    organiser_contact: null,
    club_id: null,
    region: "devon",
    approved: true,
    created_at: "2026-10-01T00:00:00+00:00",
    updated_at: "2026-10-01T00:00:00+00:00",
    ...overrides,
  };
}

describe("buildCalendar", () => {
  it("builds a feed for good rows", () => {
    const { error, value } = buildCalendar([row()]);
    expect(error).toBeUndefined();
    expect(value).toContain("SUMMARY:Torbay CX Round 3");
    expect(value).toContain("URL:https://example.org");
  });

  it("still serves the feed when a row has a scheme-less or hostile URL", () => {
    const { error, value } = buildCalendar([
      row({ id: "a", title: "Good" }),
      row({ id: "b", title: "Typo", organiser_url: "www.club.co.uk" }),
      row({ id: "c", title: "Hostile", organiser_url: "javascript:alert(1)", booking_link: "data:text/html,x" }),
    ]);
    expect(error).toBeUndefined();
    expect(value).toContain("SUMMARY:Good");
    expect(value).toContain("SUMMARY:Typo");
    expect(value).toContain("URL:https://www.club.co.uk");
    expect(value).toContain("SUMMARY:Hostile");
    expect(value).not.toMatch(/javascript:|data:text/);
  });

  it("skips a row the library rejects instead of failing the whole feed", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { error, value } = buildCalendar([
      row({ id: "ok", title: "Good" }),
      row({ id: "bad", title: "Broken date", all_day: false, start_datetime: "not-a-date" }),
    ]);
    expect(error).toBeUndefined();
    expect(value).toContain("SUMMARY:Good");
    expect(value).not.toContain("Broken date");
    spy.mockRestore();
  });

  it("escapes line breaks in free-text fields", () => {
    const { value } = buildCalendar([row({ venue_name: "Venue\r\nATTENDEE:mailto:x@evil.example" })]);
    expect(value).not.toMatch(/\r\nATTENDEE/);
  });
});
