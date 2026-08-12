import { test, expect } from "@playwright/test";

test.describe("Contact form", () => {
  test("empty submission is blocked by required fields", async ({ page }) => {
    await page.goto("/contact");
    await page.getByRole("button", { name: /send message/i }).click();
    // Browser-native validation keeps us on the page — no success/error text yet.
    await expect(page.getByText("Thanks — your message has been sent.")).toHaveCount(0);
  });

  test("organiser reason is preselected via query param", async ({ page }) => {
    await page.goto("/contact?reason=organiser");
    await expect(page.locator('select[name="reason"]')).toHaveValue("organiser");
  });

  // Submits a real message — this hits the live server action, which sends a
  // real email if RESEND_API_KEY/ADMIN_NOTIFICATION_EMAIL are configured in
  // whatever environment this runs against. The assertion accepts either
  // outcome (sent, or "not configured" in an environment without those
  // secrets) rather than asserting on a specific one.
  test("filled submission reaches the server action", async ({ page }) => {
    await page.goto("/contact");
    await page.locator('input[name="name"]').fill("Playwright E2E");
    await page.locator('input[name="email"]').fill("e2e-test@example.com");
    await page.locator('textarea[name="message"]').fill("Automated end-to-end test submission.");
    await page.getByRole("button", { name: /send message/i }).click();

    await expect(
      page.getByText(/Thanks — your message has been sent\.|isn't configured yet/)
    ).toBeVisible({ timeout: 10_000 });
  });
});
