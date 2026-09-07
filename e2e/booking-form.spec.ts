import { test, expect } from "@playwright/test";

// No bookable event necessarily exists in the dev database at any given
// time (bookable defaults to false for every event, and this suite never
// writes fixture rows — see Global Constraints), so these tests only cover
// what's true regardless of data: the "book" link/section doesn't appear
// on a non-bookable event, and the calendar keeps working. Capacity/
// waitlist behavior is verified manually (Task 1 Step 3's SQL, and Task 4
// Step 6 below) rather than end-to-end here.
test.describe("Signup form visibility", () => {
  test("a non-bookable event's detail page has no signup form", async ({ page }) => {
    await page.goto("/");
    await page.locator("main .row-hover a").first().click();
    await expect(page).toHaveURL(/\/events\//);
    await expect(page.locator('input[name="contact_name"]')).toHaveCount(0);
  });
});
