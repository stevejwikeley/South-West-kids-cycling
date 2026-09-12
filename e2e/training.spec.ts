import { test, expect } from "@playwright/test";

// The suite runs against live data with no fixtures, so these assert on the
// feed's shape and filtering rules rather than on specific events.

test.describe("calendar.ics training filtering", () => {
  test("the default feed contains no training sessions", async ({ request }) => {
    const res = await request.get("/calendar.ics");
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toContain("BEGIN:VCALENDAR");
    expect(body).not.toContain("Discipline: CLUSTERS");
  });

  test("?kind=training returns training and names the feed for it", async ({ request }) => {
    const res = await request.get("/calendar.ics?kind=training");
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toContain("X-WR-CALNAME:South West Kids Cycling — Club training");
    expect(body).toContain("Discipline: CLUSTERS");
  });

  test("?kind=all returns both races and training", async ({ request }) => {
    const body = await (await request.get("/calendar.ics?kind=all")).text();
    expect(body).toContain("Discipline: CLUSTERS");
    const races = body.match(/Discipline: (?!CLUSTERS)[A-Z]+/g) ?? [];
    expect(races.length).toBeGreaterThan(0);
  });

  test("an existing ?discipline=clusters subscription still delivers training", async ({ request }) => {
    const body = await (await request.get("/calendar.ics?discipline=clusters")).text();
    expect(body).toContain("Discipline: CLUSTERS");
  });

  test("an unknown kind degrades to races rather than erroring", async ({ request }) => {
    const res = await request.get("/calendar.ics?kind=banana");
    expect(res.status()).toBe(200);
    expect(await res.text()).not.toContain("Discipline: CLUSTERS");
  });
});

test.describe("Calendar page", () => {
  test("shows no training sessions", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator("main").getByText("TRAINING SESSION")).toHaveCount(0);
  });

  test("the discipline filters offer no training chip", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Toggle filters" }).click();
    await expect(page.getByRole("button", { name: "Training session" })).toHaveCount(0);
  });
});
