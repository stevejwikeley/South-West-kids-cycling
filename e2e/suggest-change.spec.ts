import { test, expect } from "@playwright/test";

test("suggest-a-change opens in a side panel and shows required fields", async ({ page }) => {
  await page.goto("/");
  const suggestButton = page.getByRole("button", { name: "Suggest a change" }).first();
  await expect(suggestButton).toBeVisible();
  await suggestButton.click();

  await expect(page.getByText("SUGGEST A CHANGE", { exact: true })).toBeVisible();
  await expect(page.locator('input[name="title"]')).toBeVisible();
  await expect(page.locator('select[name="discipline"]')).toBeVisible();
  await expect(page.getByRole("button", { name: /suggest this change/i })).toBeVisible();
  await expect(page).toHaveURL("/");
});

test("suggest-a-change panel closes without navigating away", async ({ page }) => {
  await page.goto("/");
  const suggestButton = page.getByRole("button", { name: "Suggest a change" }).first();
  await suggestButton.click();
  await expect(page.locator('input[name="title"]')).toBeVisible();

  const closeButton = page.getByRole("button", { name: "Close" });
  await closeButton.click();
  await expect(page.getByText("SUGGEST A CHANGE", { exact: true })).toHaveCount(0);
  await expect(page).toHaveURL("/");
});
