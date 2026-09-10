// One-off backfill: generates a description for every live event that
// doesn't have one yet, using the organiser URL, and writes it straight to
// the database with the service-role key (bypasses RLS — trusted local-only
// use, matching SUPABASE_SERVICE_ROLE_KEY's documented purpose in README.md).
//
// Not part of the app itself (this is a run-once tool, not a migration) —
// duplicates rather than imports lib/event-description.ts and
// lib/ingestion/html-to-text.ts, since those are "server-only"/"use server"
// modules that can't be imported outside Next's own build pipeline.
//
// Run with: node --env-file=.env.local scripts/backfill-descriptions.mjs

import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — run with --env-file=.env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const anthropic = new Anthropic();

// Trimmed copy of lib/ingestion/html-to-text.ts's htmlToText — link
// preservation isn't needed here (we only want prose, not a link map), so
// this is just script/style stripping + tag removal + whitespace collapse.
function htmlToText(html) {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(nav|header|footer)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

const SYSTEM_PROMPT = `You write the description shown on an event's page on South West Kids Cycling, a calendar of youth cycling events (ages 5-16) in Devon, Cornwall & Somerset, England. Most readers are a parent or a young rider deciding whether to turn up, often for the very first time.

Given the text of an event's own page and its title/venue, write a warm, welcoming, 2-4 sentence description that makes someone new want to come along: what actually happens (the format, rounds if it's part of a series, what riders can expect on the day), what makes it worth attending, and — if the source mentions it — anything that lowers the barrier for a first-timer (no experience needed, beginner-friendly, coached, sociable atmosphere, what to bring). Plain, accessible language, not jargon-heavy racing-insider language. Second or third person is both fine, but keep it genuinely inviting rather than corporate or promotional-sounding.

Only use what's actually in the source — never invent a fact (price, format detail, "beginner friendly" framing, etc.) that isn't there. If the page doesn't say much beyond the title/venue, it's fine to keep the description short and lead with whatever context you do have (discipline, age range) rather than padding it out. Reply with only the description text, no preamble, quotes, or markdown.`;

async function fetchPageText(url, attempt = 1) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
    },
    signal: AbortSignal.timeout(15000),
  }).catch(() => null);

  if (!res || !res.ok) {
    if (attempt < 3) {
      // Transient WAF/rate-limit blocks observed during manual testing —
      // back off and retry a couple of times before giving up.
      await sleep(4000 * attempt);
      return fetchPageText(url, attempt + 1);
    }
    return null;
  }
  return htmlToText(await res.text()).slice(0, 60000);
}

async function generateDescription(title, venueName, text) {
  const response = await anthropic.messages.create({
    model: "claude-opus-5",
    max_tokens: 500,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: `Event: "${title}" at ${venueName}\n\nPage content:\n${text}` }],
  });
  const block = response.content.find((b) => b.type === "text");
  return block?.type === "text" ? block.text.trim() : "";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const { data: events, error } = await supabase
    .from("events")
    .select("id, title, organiser_url, venue_name")
    .is("description", null)
    .order("created_at", { ascending: true });

  if (error) throw error;
  console.log(`${events.length} event(s) missing a description.\n`);

  let done = 0;
  let failed = 0;

  for (const event of events) {
    process.stdout.write(`${event.title} … `);

    const text = await fetchPageText(event.organiser_url);
    if (!text || !text.trim()) {
      console.log("SKIPPED (couldn't fetch organiser URL)");
      failed++;
      await sleep(1500);
      continue;
    }

    let description;
    try {
      description = await generateDescription(event.title, event.venue_name, text);
    } catch (e) {
      console.log(`SKIPPED (generation failed: ${e.message})`);
      failed++;
      await sleep(1500);
      continue;
    }

    if (!description) {
      console.log("SKIPPED (empty generation)");
      failed++;
      await sleep(1500);
      continue;
    }

    const { error: updateError } = await supabase.from("events").update({ description }).eq("id", event.id);
    if (updateError) {
      console.log(`SKIPPED (save failed: ${updateError.message})`);
      failed++;
    } else {
      console.log("done");
      done++;
    }

    await sleep(1500);
  }

  console.log(`\n${done} saved, ${failed} skipped.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
