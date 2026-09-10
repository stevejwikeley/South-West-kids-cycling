import { test, expect, type Page } from "@playwright/test";

// The feed URL is shown in a readonly field (components/CopyLink.tsx), and
// Apple's panel renders two of them — the first is the one under test.
const feedLink = (page: Page) => page.getByRole("textbox", { name: "Calendar feed link" }).first();

// Runs against whatever is in the dev Supabase project (see playwright.config.ts)
// — assertions here are about the feed URL the page builds and the shape of
// the response, never about specific events.
test.describe("Subscribe page feed builder", () => {
  test("defaults to the unfiltered feed link", async ({ page }) => {
    await page.goto("/subscribe");
    await expect(page.getByText(/You'll get:/)).toContainText("All events");

    await page.getByRole("button", { name: /Google Calendar/ }).click();
    await expect(feedLink(page)).toHaveValue("https://www.southwestkidscycling.uk/calendar.ics");
  });

  test("picking a discipline narrows the feed link", async ({ page }) => {
    await page.goto("/subscribe");
    await page.getByRole("button", { name: "Cyclocross", exact: true }).click();
    await page.getByRole("button", { name: /Google Calendar/ }).click();

    await expect(feedLink(page)).toHaveValue(/\/calendar\.ics\?discipline=cx$/);
    await expect(page.getByText(/You'll get:/)).toContainText("Cyclocross events");
  });

  test("picking a county adds region, and RESET clears everything", async ({ page }) => {
    await page.goto("/subscribe");
    await page.getByRole("button", { name: "Devon", exact: true }).click();
    await page.getByRole("button", { name: /Google Calendar/ }).click();

    await expect(feedLink(page)).toHaveValue(/\/calendar\.ics\?region=devon$/);

    await page.getByRole("button", { name: "RESET" }).click();
    await expect(feedLink(page)).toHaveValue("https://www.southwestkidscycling.uk/calendar.ics");
  });

  test("filters arriving as query params are preselected", async ({ page }) => {
    await page.goto("/subscribe?discipline=xc&region=cornwall");
    await expect(page.getByRole("button", { name: "XC", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "Cornwall", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText(/You'll get:/)).toContainText("XC events in Cornwall");
  });
});

test.describe("Calendar page hands filters to /subscribe", () => {
  test("an active region filter changes the subscribe link and label", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /toggle filters/i }).click();
    await page.getByRole("button", { name: "DEVON", exact: true }).click();

    const subscribeLink = page.getByRole("link", { name: /Subscribe to these events/ }).first();
    await expect(subscribeLink).toHaveAttribute("href", "/subscribe?region=devon");

    await subscribeLink.click();
    await expect(page.getByRole("button", { name: "Devon", exact: true })).toHaveAttribute("aria-pressed", "true");
  });
});

test.describe("calendar.ics feed", () => {
  test("serves iCalendar with a filter-specific name", async ({ request }) => {
    const res = await request.get("/calendar.ics?discipline=cx&region=devon");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/calendar");

    const body = await res.text();
    expect(body).toContain("BEGIN:VCALENDAR");
    expect(body).toContain("X-WR-CALNAME:South West Kids Cycling — Cyclocross, Devon");
    expect(body).toContain("REFRESH-INTERVAL;VALUE=DURATION:PT1H");
  });

  test("a malformed club id degrades to the unfiltered feed rather than erroring", async ({ request }) => {
    const res = await request.get("/calendar.ics?club=not-a-uuid");
    expect(res.status()).toBe(200);
    expect(await res.text()).toContain("X-WR-CALNAME:South West Kids Cycling");
  });
});
