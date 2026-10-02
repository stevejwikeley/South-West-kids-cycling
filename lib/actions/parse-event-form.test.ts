import { describe, expect, it } from "vitest";
import { parseEventForm } from "./parse-event-form";

function form(overrides: Record<string, string | string[] | null> = {}) {
  const fields: Record<string, string | string[] | null> = {
    title: "Torbay CX Round 3",
    discipline: "cx",
    status: "confirmed",
    date: "2026-10-18",
    all_day: "on",
    venue_name: "Clennon Valley",
    region: "devon",
    ages: ["u8", "u10"],
    booking_status: "planned",
    organiser_url: "https://example.org",
    ...overrides,
  };
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value === null) continue;
    for (const v of Array.isArray(value) ? value : [value]) fd.append(key, v);
  }
  return fd;
}

describe("parseEventForm", () => {
  it("parses an all-day event to midnight UTC with no end time", () => {
    const result = parseEventForm(form());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.values).toMatchObject({
      title: "Torbay CX Round 3",
      all_day: true,
      start_datetime: "2026-10-18T00:00:00.000Z",
      end_datetime: null,
      age_categories: ["u8", "u10"],
      kids_only: false,
      address: null,
      booking_link: null,
    });
  });

  it("converts timed events from UK local time to UTC", () => {
    const result = parseEventForm(form({ all_day: null, start_time: "09:30", end_time: "13:00" }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.values.start_datetime).toBe("2026-10-18T08:30:00.000Z"); // still BST on 18 Oct
    expect(result.values.end_datetime).toBe("2026-10-18T12:00:00.000Z");
  });

  it.each([
    [{ title: "  " }, "Title is required."],
    [{ date: "" }, "Date is required."],
    [{ ages: null }, "Pick at least one age category."],
    [{ organiser_url: "" }, "Organiser URL is required."],
    [{ booking_status: "open" }, "Booking link is required when entries are open."],
    [{ all_day: null }, "Start time is required for a timed event."],
  ])("rejects %j", (overrides, error) => {
    expect(parseEventForm(form(overrides))).toEqual({ ok: false, error });
  });
});
