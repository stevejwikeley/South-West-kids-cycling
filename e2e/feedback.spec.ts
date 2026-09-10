import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

// The popup is rendered on every non-admin page and starts collapsed; the
// auto-expand timer is 30s, so these tests click the bubble rather than
// waiting for it.
async function openFeedback(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Open feedback form" }).click();
  await expect(page.getByText("QUICK FEEDBACK")).toBeVisible();
}

test.describe("Feedback popup", () => {
  test("submitting with nothing answered is rejected", async ({ page }) => {
    await openFeedback(page);
    await page.getByRole("button", { name: /send feedback/i }).click();
    await expect(page.getByText("Answer at least one question first.")).toBeVisible();
  });

  test("an invalid email is rejected", async ({ page }) => {
    await openFeedback(page);
    await page.getByRole("button", { name: "5", exact: true }).click();
    // type=email would block submission client-side, so this fills a value
    // the browser accepts but the server action's stricter regex rejects.
    await page.locator('input[name="email"]').fill("someone@example");
    await page.getByRole("button", { name: /send feedback/i }).click();
    await expect(page.getByText("That doesn't look like a valid email address.")).toBeVisible();
  });

  // Writes a real row to site_feedback (the suite runs against the live
  // Supabase project — see playwright.config.ts), hence the marker text so
  // test rows are obvious and filterable. Also the regression guard for the
  // admin notification email: if that send ever throws instead of being
  // swallowed, this stops showing the thanks message.
  test("a completed submission succeeds", async ({ page }) => {
    await openFeedback(page);
    await page.getByRole("button", { name: "Yes", exact: true }).first().click();
    await page.getByRole("button", { name: "5", exact: true }).click();
    await page.locator('textarea[name="message"]').fill("[e2e test] Automated end-to-end test submission — please ignore.");
    await page.getByRole("button", { name: /send feedback/i }).click();

    await expect(page.getByText("Thanks for the feedback — really appreciate it.")).toBeVisible({ timeout: 10_000 });
  });
});
