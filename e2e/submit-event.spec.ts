import { test, expect } from "@playwright/test";

// No test here submits through either mode: the "paste a link or text" path
// calls the real Claude API (extractEvents), which costs real money on
// every CI run — unlike the contact form, which only costs an email send.
// Coverage stays at rendering/validation, which is where regressions are
// most likely to hide anyway (a broken mode toggle, a required field that
// stopped being required).
test.describe("Submit an event", () => {
  test("loads with the link/text mode selected by default", async ({ page }) => {
    await page.goto("/submit-event");
    await expect(page.getByRole("heading", { name: /event missing/i })).toBeVisible();
    await expect(page.locator('textarea[name="input"]')).toBeVisible();
  });

  test("switching to form mode shows the structured fields", async ({ page }) => {
    await page.goto("/submit-event");
    await page.getByRole("button", { name: /fill in a form/i }).click();
    await expect(page.locator('input[name="title"]')).toBeVisible();
    await expect(page.locator('select[name="discipline"]')).toBeVisible();
  });

  test("empty form submission is blocked by required fields", async ({ page }) => {
    await page.goto("/submit-event");
    await page.getByRole("button", { name: /fill in a form/i }).click();
    await page.getByRole("button", { name: /submit for review/i }).click();
    // Browser-native validation keeps us on the page — no success text yet.
    await expect(page.getByText(/sent for review/i)).toHaveCount(0);
  });
});
