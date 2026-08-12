import { test, expect } from "@playwright/test";

test("suggest-a-change form loads for the first event and shows required fields", async ({ page }) => {
  await page.goto("/");
  const suggestLink = page.getByRole("link", { name: "Suggest a change" }).first();
  await expect(suggestLink).toBeVisible();
  await suggestLink.click();

  await expect(page).toHaveURL(/\/events\/.+\/suggest-change$/);
  await expect(page.locator('input[name="title"]')).toBeVisible();
  await expect(page.locator('select[name="discipline"]')).toBeVisible();
  await expect(page.getByRole("button", { name: /suggest this change/i })).toBeVisible();
});
