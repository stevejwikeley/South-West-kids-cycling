// One-off backfill: proposes a postcode (and so a map pin) for every live
// event that doesn't have one, and only writes when run with --apply.
//
// Where a proposal comes from, in order:
//   1. an earlier approved event at the same venue (same rules as new
//      ingests — lib/ingestion/enrich-location.ts);
//   2. Claude's own knowledge of a named venue, when it's confident.
// Every proposal is then checked with postcodes.io: it must exist and sit
// in the event's region, or it's rejected and printed with the reason.
//
// Writes with the service-role key (bypasses RLS — trusted local-only use,
// like scripts/backfill-descriptions.mjs).
//
// Preview:  node --experimental-strip-types --env-file=.env.local scripts/backfill-locations.ts
// Write:    node --experimental-strip-types --env-file=.env.local scripts/backfill-locations.ts --apply

import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { borrowFromKnownVenue, checkPostcode, type KnownVenue, type PostcodeLookup } from "../lib/ingestion/enrich-location.ts";

const APPLY = process.argv.includes("--apply");
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — run with --env-file=.env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const anthropic = new Anthropic();

interface LiveEvent {
  id: string;
  title: string;
  venue_name: string;
  address: string | null;
  postcode: string | null;
  region: KnownVenue["region"];
  club_id: string | null;
  kind: string | null;
}

interface Lookup extends PostcodeLookup {
  lat: number;
  lng: number;
}

// Mirrors lib/geocode.ts lookupPostcode (a "server-only" module).
async function lookupPostcode(postcode: string): Promise<Lookup | "not_found" | null> {
  try {
    const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(postcode.replace(/\s+/g, ""))}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (res.status === 404) return "not_found";
    if (!res.ok) return null;
    const { result } = await res.json();
    return { lat: result.latitude, lng: result.longitude, admin_county: result.admin_county ?? null, admin_district: result.admin_district ?? null };
  } catch {
    return null;
  }
}

async function guessPostcode(e: LiveEvent): Promise<string | null> {
  const response = await anthropic.messages.create({
    model: "claude-opus-5",
    max_tokens: 100,
    messages: [
      {
        role: "user",
        content: `What is the UK postcode of this cycling event venue in ${e.region ?? "South West England"}?

Venue: ${e.venue_name}
Address: ${e.address ?? "(not given)"}
Event: ${e.title}

Reply with only the postcode, or exactly NONE if you don't confidently know this specific venue's postcode. Don't guess from the town alone.`,
      },
    ],
  });
  const text = response.content.find((b) => b.type === "text")?.text.trim() ?? "";
  const match = text.toUpperCase().match(/\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/);
  return match ? match[0] : null;
}

const { data, error } = await supabase
  .from("events")
  .select("id, title, venue_name, address, postcode, region, club_id, kind, approved")
  .eq("approved", true);
if (error) throw error;
const events = data as (LiveEvent & { approved: boolean })[];

const known: KnownVenue[] = events
  .filter((e) => e.postcode && e.venue_name)
  .map((e) => ({ venue_name: e.venue_name, postcode: e.postcode!, address: e.address, region: e.region, club_id: e.club_id }));

const missing = events.filter((e) => !e.postcode);
console.log(`${missing.length} live events without a postcode${APPLY ? "" : " (preview only — pass --apply to write)"}\n`);

let proposed = 0;
let written = 0;
for (const e of missing) {
  const fields = { venue_name: e.venue_name, address: e.address, postcode: null, region: e.region, club_id: e.club_id, kind: e.kind };
  const borrowed = borrowFromKnownVenue(fields, known);
  let postcode = borrowed.values.postcode;
  let source = "earlier event at same venue";
  if (!postcode) {
    postcode = await guessPostcode(e);
    source = "Claude's knowledge of the venue";
  }
  if (!postcode) {
    console.log(`  –  ${e.title} @ ${e.venue_name}: no confident postcode`);
    continue;
  }

  const lookup = await lookupPostcode(postcode);
  if (lookup === null) {
    console.log(`  ?  ${e.title} @ ${e.venue_name}: ${postcode} — couldn't reach postcodes.io, skipped`);
    continue;
  }
  const checked = checkPostcode({ ...fields, postcode }, lookup === "not_found" ? null : lookup);
  const problem = checked.flags.postcode ?? checked.flags.region;
  if (lookup === "not_found" || problem) {
    console.log(`  ✗  ${e.title} @ ${e.venue_name}: ${postcode} rejected — ${problem}`);
    continue;
  }

  proposed++;
  console.log(`  ✓  ${e.title} @ ${e.venue_name}: ${postcode} (${source}, ${lookup.admin_district})`);
  if (!APPLY) continue;

  const { error: updateError } = await supabase
    .from("events")
    .update({ postcode, lat: lookup.lat, lng: lookup.lng, address: e.address ?? borrowed.values.address })
    .eq("id", e.id);
  if (updateError) console.log(`     write failed: ${updateError.message}`);
  else written++;
}

console.log(`\n${proposed} proposed${APPLY ? `, ${written} written` : ""}.`);
