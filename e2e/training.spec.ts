import { test, expect } from "@playwright/test";

// The suite runs against live data with no fixtures, so these assert on the
// feed's shape and filtering rules rather than on specific events.

// Pulls every `UID:...` value out of an .ics body. UIDs are short
// (`<event-id>@southwestkidscycling.co.uk`), well under the 75-octet fold
// threshold, so — unlike the `Discipline: TRAINING` string these tests used
// to grep for — they never wrap across a line fold and never depend on
// which discipline label a row happens to carry.
function uidsOf(body: string): Set<string> {
  return new Set([...body.matchAll(/^UID:(.+)$/gm)].map((m) => m[1].trim()));
}

function veventCount(body: string): number {
  return (body.match(/BEGIN:VEVENT/g) ?? []).length;
}

test.describe("calendar.ics training filtering", () => {
  test("the default feed contains no training sessions", async ({ request }) => {
    const [res, trainingRes] = await Promise.all([
      request.get("/calendar.ics"),
      request.get("/calendar.ics?kind=training"),
    ]);
    expect(res.status()).toBe(200);
    expect(trainingRes.status()).toBe(200);
    const [body, trainingBody] = await Promise.all([res.text(), trainingRes.text()]);
    expect(body).toContain("BEGIN:VCALENDAR");

    // Holds regardless of which discipline label training rows happen to
    // carry today: the default feed's UIDs must be disjoint from the
    // ?kind=training feed's UIDs, so training leaking into the default feed
    // fails this even if training's discipline value changes again.
    const trainingUids = uidsOf(trainingBody);
    const bodyUids = uidsOf(body);
    expect(trainingUids.size).toBeGreaterThan(0);
    for (const uid of trainingUids) expect(bodyUids.has(uid)).toBe(false);
  });

  // Asserts the `kind` contract itself (feed naming + which rows a
  // kind=training subscription includes vs. excludes), not the `discipline`
  // value those rows happen to carry today — the coupling that broke when a
  // migration changed training rows' discipline label out from under it.
  test("?kind=training returns training and names the feed for it", async ({ request }) => {
    const [raceRes, trainingRes] = await Promise.all([
      request.get("/calendar.ics"),
      request.get("/calendar.ics?kind=training"),
    ]);
    expect(raceRes.status()).toBe(200);
    expect(trainingRes.status()).toBe(200);
    const [raceBody, trainingBody] = await Promise.all([raceRes.text(), trainingRes.text()]);

    expect(trainingBody).toContain("X-WR-CALNAME:South West Kids Cycling — Club training");

    // There is real, live kind=training data (that's the whole point of the
    // feature) and none of it is also kind=race — the two feeds partition
    // the same table by the `kind` column, so their UID sets must be
    // disjoint and the training feed must be non-empty.
    const trainingUids = uidsOf(trainingBody);
    const raceUids = uidsOf(raceBody);
    expect(trainingUids.size).toBeGreaterThan(0);
    for (const uid of trainingUids) expect(raceUids.has(uid)).toBe(false);
  });

  test("?kind=all returns both races and training", async ({ request }) => {
    const [raceRes, allRes] = await Promise.all([
      request.get("/calendar.ics"),
      request.get("/calendar.ics?kind=all"),
    ]);
    const [raceBody, allBody] = await Promise.all([raceRes.text(), allRes.text()]);

    // kind=all is the union of the race-only and training-only feeds, so it
    // must contain strictly more entries than the default (race) feed alone
    // — strictly more, because it must be adding at least the live
    // training rows, not merely as many — and every default-feed entry must
    // still be present in it (a genuine superset, not just a bigger count).
    const raceUids = uidsOf(raceBody);
    const allUids = uidsOf(allBody);
    expect(veventCount(allBody)).toBeGreaterThan(veventCount(raceBody));
    for (const uid of raceUids) expect(allUids.has(uid)).toBe(true);
  });

  // Clusters is a real event discipline (a cluster session — several clubs
  // training together, a few times a year), never a stand-in for club
  // training, whether or not the request also names `kind`. An explicit
  // `kind=race` and the bare-discipline default (kind defaults to "race")
  // must behave identically — there is no longer any special case for a
  // discipline-only `?discipline=clusters` request.
  test("?discipline=clusters&kind=race returns cluster sessions only, not club training", async ({ request }) => {
    const [res, trainingRes] = await Promise.all([
      request.get("/calendar.ics?discipline=clusters&kind=race"),
      request.get("/calendar.ics?kind=training"),
    ]);
    expect(res.status()).toBe(200);
    expect(trainingRes.status()).toBe(200);
    const [body, trainingBody] = await Promise.all([res.text(), trainingRes.text()]);
    expect(body).toContain("BEGIN:VCALENDAR");

    // Must never contain a club-training UID, regardless of which discipline
    // label training rows happen to carry today.
    const trainingUids = uidsOf(trainingBody);
    const bodyUids = uidsOf(body);
    expect(trainingUids.size).toBeGreaterThan(0);
    for (const uid of trainingUids) expect(bodyUids.has(uid)).toBe(false);
  });

  // Same assertion as above, but with `kind` omitted entirely. There used to
  // be a shim here that treated a bare `?discipline=clusters` (no `kind` at
  // all) as a pre-`kind` training subscription and widened the discipline
  // match to include club training — that has been removed as a deliberate
  // breaking change: `kind` defaults to "race" whether or not `discipline`
  // is present, so this must resolve identically to `?discipline=clusters
  // &kind=race` and pull in zero club training, even though that silently
  // stops delivering training to any subscription built before `clusters`
  // was corrected to mean a cluster session.
  test("?discipline=clusters with no kind returns cluster sessions only, not club training", async ({ request }) => {
    const [res, trainingRes] = await Promise.all([
      request.get("/calendar.ics?discipline=clusters"),
      request.get("/calendar.ics?kind=training"),
    ]);
    expect(res.status()).toBe(200);
    expect(trainingRes.status()).toBe(200);
    const [body, trainingBody] = await Promise.all([res.text(), trainingRes.text()]);
    expect(body).toContain("BEGIN:VCALENDAR");

    // No `?kind=training` UID may appear here — the opposite of what the
    // removed shim guaranteed.
    const trainingUids = uidsOf(trainingBody);
    const bodyUids = uidsOf(body);
    expect(trainingUids.size).toBeGreaterThan(0);
    for (const uid of trainingUids) expect(bodyUids.has(uid)).toBe(false);
  });

  test("an unknown kind degrades to races rather than erroring", async ({ request }) => {
    const [res, trainingRes] = await Promise.all([
      request.get("/calendar.ics?kind=banana"),
      request.get("/calendar.ics?kind=training"),
    ]);
    expect(res.status()).toBe(200);
    expect(trainingRes.status()).toBe(200);
    const [body, trainingBody] = await Promise.all([res.text(), trainingRes.text()]);

    const trainingUids = uidsOf(trainingBody);
    const bodyUids = uidsOf(body);
    expect(trainingUids.size).toBeGreaterThan(0);
    for (const uid of trainingUids) expect(bodyUids.has(uid)).toBe(false);
  });
});

// Club only ever narrows training — a race isn't "this club's race" the way
// a training session is "this club's session" (most races carry no club_id
// at all), so filtering races by club used to return next to nothing for
// anyone who picked a club without also including training. These pull a
// real club id from /clubs's own training bands (the same pattern the
// "Clubs page training" tests below already use) rather than hardcoding
// one, so they don't rot if that club's data changes.
test.describe("calendar.ics club filtering", () => {
  async function aTrainingClubId(page: import("@playwright/test").Page): Promise<string> {
    await page.goto("/clubs");
    const band = page.getByTestId("club-training").first();
    const feedLink = band.getByRole("link", { name: /add this club's training/i });
    const href = await feedLink.getAttribute("href");
    const clubId = href?.match(/[?&]club=([0-9a-f-]{36})/)?.[1];
    if (!clubId) throw new Error("Expected at least one club with a training subscribe link on /clubs");
    return clubId;
  }

  test("a club filter alone does not narrow the race feed", async ({ page, request }) => {
    const clubId = await aTrainingClubId(page);
    const [baseRes, clubRes] = await Promise.all([request.get("/calendar.ics"), request.get(`/calendar.ics?club=${clubId}`)]);
    expect(baseRes.status()).toBe(200);
    expect(clubRes.status()).toBe(200);
    const [baseBody, clubBody] = await Promise.all([baseRes.text(), clubRes.text()]);

    // Picking a club with no kind (kind defaults to "race") must be a
    // complete no-op on which races come back — the exact same set, not
    // merely the same count.
    expect(uidsOf(clubBody)).toEqual(uidsOf(baseBody));
  });

  test("?club=<id>&kind=training still scopes training to that club", async ({ page, request }) => {
    const clubId = await aTrainingClubId(page);
    const [trainingRes, clubTrainingRes] = await Promise.all([
      request.get("/calendar.ics?kind=training"),
      request.get(`/calendar.ics?club=${clubId}&kind=training`),
    ]);
    const [trainingBody, clubTrainingBody] = await Promise.all([trainingRes.text(), clubTrainingRes.text()]);

    const clubTrainingUids = uidsOf(clubTrainingBody);
    const trainingUids = uidsOf(trainingBody);
    // Non-empty (this club genuinely trains, or /clubs wouldn't have shown
    // its subscribe link) and a subset of all training — the regression
    // guard for the case that must NOT change: ClubTrainingBand's own
    // per-club feed link relies on exactly this scoping.
    expect(clubTrainingUids.size).toBeGreaterThan(0);
    for (const uid of clubTrainingUids) expect(trainingUids.has(uid)).toBe(true);
  });

  test("?club=<id>&kind=all returns every race plus only that club's training", async ({ page, request }) => {
    const clubId = await aTrainingClubId(page);
    const [raceRes, clubTrainingRes, allClubRes] = await Promise.all([
      request.get("/calendar.ics"),
      request.get(`/calendar.ics?club=${clubId}&kind=training`),
      request.get(`/calendar.ics?club=${clubId}&kind=all`),
    ]);
    const [raceBody, clubTrainingBody, allClubBody] = await Promise.all([raceRes.text(), clubTrainingRes.text(), allClubRes.text()]);

    const raceUids = uidsOf(raceBody);
    const clubTrainingUids = uidsOf(clubTrainingBody);
    const allClubUids = uidsOf(allClubBody);

    // Every race is present — club never narrows races, even under
    // kind=all — plus exactly this club's training, and nothing from any
    // other club's training (kind partitions the table, so race and
    // training UIDs can never overlap; a plain size check is therefore a
    // genuine equality check here, not just a lower bound).
    for (const uid of raceUids) expect(allClubUids.has(uid)).toBe(true);
    for (const uid of clubTrainingUids) expect(allClubUids.has(uid)).toBe(true);
    expect(allClubUids.size).toBe(raceUids.size + clubTrainingUids.size);
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

  test("each club row carries an anchor built from its own club id", async ({ page }) => {
    await page.goto("/clubs");

    // One anchor per rendered club row — not just that some anchor exists
    // somewhere on the page. `.row-hover` is the same div the anchor id is
    // set on, but counted via an independent selector so a row silently
    // missing its id (or an id duplicated onto the wrong row) would show up
    // as a mismatch rather than passing by construction.
    const anchors = page.locator('main [id^="club-"]');
    const rowCount = await page.locator("main .row-hover").count();
    expect(rowCount).toBeGreaterThan(0);
    await expect(anchors).toHaveCount(rowCount);

    // Pick a club whose training band independently states its own club id
    // (via the "add this club's training" feed link's `?club=` param), then
    // confirm that exact link lives inside the row anchored at that same
    // id — i.e. the anchor on THIS row matches THIS club, not merely that
    // anchors exist in general.
    const band = page.getByTestId("club-training").first();
    const feedLink = band.getByRole("link", { name: /add this club's training/i });
    const feedHref = await feedLink.getAttribute("href");
    const clubId = feedHref?.match(/[?&]club=([0-9a-f-]{36})/)?.[1];
    expect(clubId).toBeTruthy();

    const ownRow = page.locator(`main #club-${clubId}`);
    await expect(ownRow).toHaveCount(1);
    await expect(ownRow.getByRole("link", { name: /add this club's training/i })).toHaveAttribute("href", feedHref!);
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

test.describe("Embed builder segmented control", () => {
  test("defaults to Races & events only, with no kind param in the snippet", async ({ page }) => {
    await page.goto("/embed-builder");
    await expect(page.locator("pre")).not.toContainText("kind=");
  });

  test("ticking the add-on checkbox under Races & events builds a kind=all embed", async ({ page }) => {
    await page.goto("/embed-builder");
    await page.getByRole("checkbox", { name: /also include club training sessions/i }).check();
    await expect(page.locator("pre")).toContainText("kind=all");
  });

  test("selecting Club training builds a kind=training embed", async ({ page }) => {
    await page.goto("/embed-builder");
    await page.getByRole("button", { name: "Club training" }).click();
    await expect(page.locator("pre")).toContainText("kind=training");
  });

  test("a discipline chip selected before the add-on is ticked still appends training to kind=all", async ({ page }) => {
    await page.goto("/embed-builder");
    await page.getByRole("button", { name: "Cyclocross" }).click();
    await page.getByRole("checkbox", { name: /also include club training sessions/i }).check();
    await expect(page.locator("pre")).toContainText("discipline=cx%2Ctraining");
    await expect(page.locator("pre")).toContainText("kind=all");
  });

  test("selecting Club training hides the add-on checkbox — there is nothing left to add to", async ({ page }) => {
    await page.goto("/embed-builder");
    await expect(page.getByRole("checkbox", { name: /also include club training sessions/i })).toBeVisible();
    await page.getByRole("button", { name: "Club training" }).click();
    await expect(page.getByRole("checkbox", { name: /also include club training sessions/i })).toHaveCount(0);
  });

  test("selecting Club training disables the discipline chips with an explanatory note", async ({ page }) => {
    await page.goto("/embed-builder");
    const chip = page.getByRole("button", { name: "Cyclocross" });
    await expect(chip).toBeEnabled();
    await page.getByRole("button", { name: "Club training" }).click();
    await expect(chip).toBeDisabled();
    await expect(page.getByText(/training sessions aren't split by discipline/i)).toBeVisible();
  });
});

// Same fix, same reasoning, on the widget clubs embed on their own
// websites: club only narrows training there too (app/embed/page.tsx).
test.describe("embed club filtering", () => {
  test("a club filter alone does not narrow the embedded race list", async ({ page }) => {
    await page.goto("/clubs");
    const band = page.getByTestId("club-training").first();
    const feedLink = band.getByRole("link", { name: /add this club's training/i });
    const href = await feedLink.getAttribute("href");
    const clubId = href?.match(/[?&]club=([0-9a-f-]{36})/)?.[1];
    expect(clubId).toBeTruthy();

    await page.goto("/embed");
    const baseCount = await page.getByRole("link", { name: /Book|Organisers website/ }).count();

    await page.goto(`/embed?club=${clubId}`);
    const clubCount = await page.getByRole("link", { name: /Book|Organisers website/ }).count();

    // Picking a club with no kind (kind defaults to "race") must not shrink
    // the embedded race list — same invariant as the .ics feed's equivalent
    // test, checked here via the actual rendered links rather than a raw
    // HTML regex, since /embed's markup carries no per-event id to match on.
    expect(clubCount).toBe(baseCount);
  });
});
