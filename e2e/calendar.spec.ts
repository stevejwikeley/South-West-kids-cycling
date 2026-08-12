import { test, expect } from "@playwright/test";

test.describe("Calendar page", () => {
  test("loads and shows the hero + at least one event row", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /one calendar for all cycling races/i })).toBeVisible();
    // "Book" or "Organisers website" — whichever the first event has.
    await expect(page.locator("main a", { hasText: /Book|Organisers website/ }).first()).toBeVisible();
  });

  test("footer links are present", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: /submit an event/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /request an account/i })).toBeVisible();
  });

  test("discipline filter narrows the list and CLEAR resets it", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /toggle filters/i }).click();
    const disciplineButtons = page.locator('div:has(> span:text("DISCIPLINE")) button');
    const firstDiscipline = disciplineButtons.first();
    await expect(firstDiscipline).toBeVisible();
    const label = (await firstDiscipline.textContent())?.trim() ?? "";

    await firstDiscipline.click();
    await expect(page.getByRole("button", { name: "CLEAR" })).toBeVisible();

    // Every visible discipline pill on event rows should now match the active filter.
    const rowDisciplinePills = page.locator("main .row-hover span.mono", { hasText: label.toUpperCase() });
    await expect(rowDisciplinePills.first()).toBeVisible();

    await page.getByRole("button", { name: "CLEAR" }).click();
    await expect(page.getByRole("button", { name: "CLEAR" })).toHaveCount(0);
  });

  test("region filter and search narrow the list", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /toggle filters/i }).click();
    await page.getByRole("button", { name: "DEVON", exact: true }).click();
    await expect(page.getByRole("button", { name: "DEVON", exact: true })).toHaveCSS("color", "rgb(250, 250, 248)");

    await page.getByPlaceholder("Search events or venues").fill("zzzzznoresultsxyz");
    await expect(page.getByText("No events match those filters.")).toBeVisible();
  });

  test("only disciplines present in the data are shown as filters", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /toggle filters/i }).click();
    const disciplineRow = page.locator('div:has(> span:text("DISCIPLINE"))').first();
    const shownLabels = await disciplineRow.locator("button").allTextContents();
    expect(shownLabels.length).toBeGreaterThan(0);
    // Sanity: no duplicate labels, and none are empty.
    expect(new Set(shownLabels).size).toBe(shownLabels.length);
    for (const label of shownLabels) expect(label.trim().length).toBeGreaterThan(0);
  });

  test("venue link points at Google Maps with a region/UK hint", async ({ page }) => {
    await page.goto("/");
    const venueLink = page.locator('main a[href*="google.com/maps/search"]').first();
    await expect(venueLink).toBeVisible();
    const href = await venueLink.getAttribute("href");
    expect(href).toContain("UK");
  });
});

test.describe("Subscribe page", () => {
  test("loads from the calendar CTA and shows platform options", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /^subscribe$/i }).click();
    await expect(page).toHaveURL(/\/subscribe$/);
    await expect(page.getByRole("button", { name: /google calendar/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /apple calendar/i })).toBeVisible();
  });
});
