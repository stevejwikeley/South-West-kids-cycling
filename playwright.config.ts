import { defineConfig, devices } from "@playwright/test";

// E2E smoke tests run against a locally-started dev server backed by the
// real (dev) Supabase project — there's no separate seeded test database,
// so tests read whatever events/clubs currently exist rather than asserting
// on specific fixture data.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    // Chromium-based mobile emulation (not WebKit) so the suite only needs
    // one browser binary installed (`npx playwright install chromium`).
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
