import { test, expect } from "@playwright/test";

test.describe("Admin/organiser auth gate", () => {
  for (const path of ["/admin", "/organiser", "/admin/pending", "/admin/sources"]) {
    test(`${path} redirects to /login when logged out`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/);
    });
  }
});
