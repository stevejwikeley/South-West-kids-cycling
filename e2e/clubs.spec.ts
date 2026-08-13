import { test, expect } from "@playwright/test";

test.describe("Clubs page", () => {
  test("loads and shows at least one club", async ({ page }) => {
    await page.goto("/clubs");
    await expect(page.getByRole("heading", { name: /youth cycling clubs/i })).toBeVisible();
    await expect(page.locator("main .row-hover").first()).toBeVisible();
  });

  test("search narrows the list to no matches", async ({ page }) => {
    await page.goto("/clubs");
    await page.getByPlaceholder("Search clubs or towns").fill("zzzzznoresultsxyz");
    await expect(page.getByText("No clubs match those filters.")).toBeVisible();
  });
});
