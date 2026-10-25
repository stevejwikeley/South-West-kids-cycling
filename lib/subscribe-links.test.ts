import { test } from "node:test";
import assert from "node:assert/strict";
import { detectPlatform, feedUrlFor, subscribeLinkFor } from "./subscribe-links.ts";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const MAC_CHROME = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const MAC_FIREFOX = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:131.0) Gecko/20100101 Firefox/131.0";
const WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

test("phones map to their own calendar app", () => {
  assert.equal(detectPlatform(IPHONE), "iphone");
  // Android UAs also say "Linux" — Android has to win.
  assert.equal(detectPlatform(ANDROID), "android");
});

test("computers get a best guess", () => {
  assert.equal(detectPlatform(MAC), "mac");
  // Only Safari on a Mac gets Apple Calendar — Chrome (whose UA also says
  // "Safari") and Firefox go to Google Calendar instead of a webcal:// link
  // the browser profile may have nothing to hand to.
  assert.equal(detectPlatform(MAC_CHROME), "google");
  assert.equal(detectPlatform(MAC_FIREFOX), "google");
  assert.equal(detectPlatform(WINDOWS), "google");
  assert.equal(detectPlatform(""), null);
});

test("feed URL omits the query string when unfiltered", () => {
  assert.equal(feedUrlFor(new URLSearchParams()), "https://www.southwestkidscycling.uk/calendar.ics");
  assert.equal(feedUrlFor(new URLSearchParams({ region: "devon" })), "https://www.southwestkidscycling.uk/calendar.ics?region=devon");
});

test("each platform gets a subscribe link, not a one-off import", () => {
  const feed = "https://www.southwestkidscycling.uk/calendar.ics?region=devon";
  assert.equal(subscribeLinkFor("iphone", feed)?.href, "webcal://www.southwestkidscycling.uk/calendar.ics?region=devon");
  assert.equal(
    subscribeLinkFor("android", feed)?.href,
    "https://calendar.google.com/calendar/render?cid=webcal%3A%2F%2Fwww.southwestkidscycling.uk%2Fcalendar.ics%3Fregion%3Ddevon"
  );
  assert.match(subscribeLinkFor("outlook", feed)?.href ?? "", /^https:\/\/outlook\.live\.com\/calendar\/0\/addfromweb\?url=https%3A/);
  assert.equal(subscribeLinkFor("other", feed), null);
});

test("webcal links stay in the tab, web pages open a new one", () => {
  const feed = "https://www.southwestkidscycling.uk/calendar.ics";
  assert.equal(subscribeLinkFor("iphone", feed)?.newTab, false);
  assert.equal(subscribeLinkFor("mac", feed)?.newTab, false);
  assert.equal(subscribeLinkFor("google", feed)?.newTab, true);
  assert.equal(subscribeLinkFor("outlook", feed)?.newTab, true);
});
