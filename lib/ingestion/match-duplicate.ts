import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import * as Sentry from "@sentry/nextjs";
import type { EventRow } from "@/lib/supabase/types";
import type { ExtractedEvent } from "./extract-events";

// Escalation path for findDuplicate() (dedup.ts) — only called for a
// candidate whose token-similarity score against one or more live events is
// inconclusive (not confident enough to auto-match, not low enough to
// confidently rule out). One call per candidate against a short shortlist,
// not one call per pair, so a noisy watched source can't balloon into
// dozens of LLM calls per check.
const MatchResultSchema = z.object({
  matched_index: z
    .number()
    .nullable()
    .describe("0-based index into the listed events of the one that is the same real-world event as the new listing, or null if none of them are — a genuinely new event."),
  reasoning: z.string().describe("One sentence explaining the decision."),
});

export async function pickSameEvent(candidate: ExtractedEvent, shortlist: EventRow[]): Promise<EventRow | null> {
  if (shortlist.length === 0) return null;

  return Sentry.startSpan(
    { name: "pickSameEvent", op: "gen_ai.match_duplicate", attributes: { "match.shortlist_size": shortlist.length } },
    async (span) => {
      const client = new Anthropic();

      const listing = shortlist
        .map((e, i) => `${i}. "${e.title}" — ${e.start_datetime.slice(0, 10)} at "${e.venue_name}"`)
        .join("\n");

      const prompt = `A youth cycling calendar is re-checking a source it has scanned before. It just extracted this listing:

"${candidate.title}" — ${candidate.date} at "${candidate.venue_name ?? "(no venue given)"}"

These are already-published events landing on the same or a nearby date. Source text (titles/venues) can be reworded slightly between scans of the same page — a season-year or qualifier dropped, a dash style changed, a word or two reordered — so don't require an exact match, only that it's clearly the same real-world event (same occasion, same date, same venue). Different rounds/days of the same series are NOT the same event even if most of the title matches.

${listing}

Which one (if any) is the same event as the new listing?`;

      let response;
      try {
        response = await client.messages.parse({
          model: "claude-opus-5",
          max_tokens: 500,
          output_config: { effort: "low", format: zodOutputFormat(MatchResultSchema) },
          messages: [{ role: "user", content: prompt }],
        });
      } catch (e) {
        Sentry.captureException(e, { tags: { operation: "match_duplicate" } });
        // Fail open to "no match" — the worst case is a duplicate lands in
        // the queue for a human to reject, not a wrongly-merged event.
        return null;
      }

      const result = response.parsed_output;
      span.setAttribute("match.matched", result ? result.matched_index !== null : false);
      if (!result || result.matched_index === null) return null;

      return shortlist[result.matched_index] ?? null;
    }
  );
}
