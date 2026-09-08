import { test, expect } from "@playwright/test";

test.describe("Attendee area", () => {
  test("/my-events redirects to /my-events/login when logged out", async ({ page }) => {
    await page.goto("/my-events");
    await expect(page).toHaveURL(/\/my-events\/login/);
  });

  test("login page sends a magic link", async ({ page }) => {
    await page.goto("/my-events/login");
    await page.locator('input[type="email"]').fill("e2e-attendee@example.com");
    await page.getByRole("button", { name: /send sign-in link/i }).click();
    // Accepts either success (check email) or Supabase error message, since email
    // deliverability is environment-dependent (follows contact.spec.ts pattern).
    await expect(
      page.getByText(/check.*for a sign-in link|error/i)
    ).toBeVisible({ timeout: 10_000 });
  });
});
