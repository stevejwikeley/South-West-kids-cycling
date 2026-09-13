import { test, expect } from "@playwright/test";

// The suite runs against live data with no fixtures, so these assert on the
// feed's shape and filtering rules rather than on specific events.

test.describe("calendar.ics training filtering", () => {
  test("the default feed contains no training sessions", async ({ request }) => {
    const res = await request.get("/calendar.ics");
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toContain("BEGIN:VCALENDAR");
    expect(body).not.toContain("Discipline: CLUSTERS");
  });

  test("?kind=training returns training and names the feed for it", async ({ request }) => {
    const res = await request.get("/calendar.ics?kind=training");
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toContain("X-WR-CALNAME:South West Kids Cycling — Club training");
    expect(body).toContain("Discipline: CLUSTERS");
  });

  test("?kind=all returns both races and training", async ({ request }) => {
    const body = await (await request.get("/calendar.ics?kind=all")).text();
    expect(body).toContain("Discipline: CLUSTERS");
    const races = body.match(/Discipline: (?!CLUSTERS)[A-Z]+/g) ?? [];
    expect(races.length).toBeGreaterThan(0);
  });

  test("an existing ?discipline=clusters subscription still delivers training", async ({ request }) => {
    const body = await (await request.get("/calendar.ics?discipline=clusters")).text();
    expect(body).toContain("Discipline: CLUSTERS");
  });

  test("an unknown kind degrades to races rather than erroring", async ({ request }) => {
    const res = await request.get("/calendar.ics?kind=banana");
    expect(res.status()).toBe(200);
    expect(await res.text()).not.toContain("Discipline: CLUSTERS");
  });
});

test.describe("Calendar page", () => {
  test("shows no training sessions", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // Races ARE present
    await expect(page.locator("main .row-hover").first()).toBeVisible();
    // Training is NOT present
    await expect(page.locator("main").getByText("TRAINING SESSION")).toHaveCount(0);
  });

  test("the discipline filters offer no training chip", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Toggle filters" }).click();
    // At least one discipline chip IS present
    await expect(page.locator('div:has(> span:text("DISCIPLINE")) button').first()).toBeVisible();
    // Training chip is NOT present
    await expect(page.getByRole("button", { name: "Training session" })).toHaveCount(0);
  });
});

test.describe("Training this week strip", () => {
  test("lists club training for the coming week and links to the clubs page", async ({ page }) => {
    await page.goto("/");
    const strip = page.getByTestId("training-this-week");
    await expect(strip).toBeVisible();
    await expect(strip.getByRole("link", { name: /all club training/i })).toBeVisible();
  });
});

test.describe("Clubs page training", () => {
  test("a club that trains shows its next session and a subscribe link", async ({ page }) => {
    await page.goto("/clubs");
    const band = page.getByTestId("club-training").first();
    await expect(band).toBeVisible();
    await expect(band).toContainText(/Next:/);
    const feed = band.getByRole("link", { name: /add this club's training/i });
    await expect(feed).toHaveAttribute("href", /\/calendar\.ics\?club=[0-9a-f-]{36}&kind=training/);
  });

  test("a club with no training listed is prompted for", async ({ page }) => {
    await page.goto("/clubs");
    await expect(page.getByText("No training sessions listed").first()).toBeVisible();
  });

  test("each club row carries an anchor the calendar strip can target", async ({ page }) => {
    await page.goto("/clubs");
    await expect(page.locator('main [id^="club-"]').first()).toBeAttached();
  });
});

// The Race/Training toggle also appears in the admin/organiser EventForm,
// SeriesForm and PendingEditPanel, and it's only there that the club-required
// validation (parseEventForm / parseSeriesForm, requireClubForTraining: true)
// actually runs — the negative-path scenario this section was meant to prove
// ("select Training, leave the club blank, submit, see 'Pick the club that
// runs this training session.'") needs one of those forms.
//
// All three live behind /admin or /organiser, which auth-gate.spec.ts already
// shows redirect straight to /login for a logged-out session, and this suite
// has no authenticated fixture anywhere: no storageState, and the one test
// that exercises sign-in (my-events-auth.spec.ts) only gets as far as "a
// magic link was sent" — it never completes a real login. So that exact
// negative-path test cannot be driven through this e2e suite as it stands.
//
// The closest reachable check is the toggle's one unauthenticated instance,
// SubmitEventForm's structured mode — where the club is deliberately NOT
// required (a member of the public has no way to know an internal club id;
// see public-submit.ts's requireClubForTraining: false). This sticks to
// rendering/state assertions and never actually submits the structured form,
// matching submit-event.spec.ts's existing pattern — a real submit would
// insert a live row into events_pending on the real dev Supabase project.
test.describe("Race/Training toggle on the public submit form", () => {
  test("defaults to Race or event, and selecting Club training does not require a club", async ({ page }) => {
    await page.goto("/submit-event");
    await page.getByRole("button", { name: /fill in a form/i }).click();

    const raceButton = page.getByRole("button", { name: "Race or event" });
    const trainingButton = page.getByRole("button", { name: "Club training" });
    await expect(raceButton).toBeVisible();
    await expect(trainingButton).toBeVisible();

    // Defaults to race — submit-event.spec.ts's existing tests depend on
    // this staying true (no newly-required field on first load).
    await expect(page.locator('input[name="kind"]')).toHaveValue("race");

    await trainingButton.click();
    await expect(page.locator('input[name="kind"]')).toHaveValue("training");

    // Unlike the admin/organiser forms, the public club <select> must never
    // gain a `required` attribute.
    await expect(page.locator('select[name="club_id"]')).not.toHaveAttribute("required");
  });
});

test.describe("Subscribe page", () => {
  test("offers no training discipline chip", async ({ page }) => {
    await page.goto("/subscribe");
    await expect(page.getByRole("button", { name: "Training session" })).toHaveCount(0);
  });

  test("ticking the club training checkbox builds a kind=all feed url", async ({ page }) => {
    await page.goto("/subscribe");
    await page.getByRole("button", { name: /club training/i }).click();
    await page.getByRole("checkbox", { name: /also include club training sessions/i }).check();
    await page.getByRole("button", { name: /Google Calendar/ }).click();
    await expect(page.getByRole("textbox", { name: "Calendar feed link" })).toHaveValue(/kind=all/);
  });
});

test.describe("Embed builder toggles", () => {
  test("defaults to races only, with no kind param in the snippet", async ({ page }) => {
    await page.goto("/embed-builder");
    await expect(page.locator("pre")).not.toContainText("kind=");
  });

  test("switching on Club training alongside Races & events builds a kind=all embed", async ({ page }) => {
    await page.goto("/embed-builder");
    await page.getByRole("button", { name: "Club training" }).click();
    await expect(page.locator("pre")).toContainText("kind=all");
  });

  test("Club training with Races & events off builds a kind=training embed", async ({ page }) => {
    await page.goto("/embed-builder");
    await page.getByRole("button", { name: "Races & events" }).click();
    await page.getByRole("button", { name: "Club training" }).click();
    await expect(page.locator("pre")).toContainText("kind=training");
  });

  test("both toggles off disables the snippet and shows a note", async ({ page }) => {
    await page.goto("/embed-builder");
    await page.getByRole("button", { name: "Races & events" }).click();
    await expect(page.locator("pre")).toHaveCount(0);
    await expect(page.getByText(/pick at least one above/i)).toBeVisible();
  });
});
