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
        .map(
          (e, i) =>
            `${i}. "${e.title}" — ${e.start_datetime?.slice(0, 10) ?? "(no date)"} at "${e.venue_name ?? "(no venue given)"}", organised by "${e.organiser_name ?? "(not stated)"}"`
        )
        .join("\n");

      const prompt = `A youth cycling calendar is checking whether a newly found listing is an event it already has (published or already waiting for review). It just found this listing:

"${candidate.title}" — ${candidate.date ?? "(no date)"} at "${candidate.venue_name ?? "(no venue given)"}", organised by "${candidate.organiser_name ?? "(not stated)"}"

Judge on four things together: the event name, the organiser, the venue and the date. None of them has to match exactly:
- Names get reworded between sources (a season year or qualifier dropped, the organiser's name prefixed, a dash changed, words reordered).
- Organisers get written differently ("South West Cyclo-Cross League" vs "South West Cyclocross League (hosted by Dartmoor Velo)").
- Venues change — an event can move to a different field or site and still be the same event.
- Dates change — an event can be postponed or brought forward by days or weeks and still be the same event.
It is the same event if it's clearly the same real-world occasion run by the same organiser, even if one of venue or date has moved. It is NOT the same event if it's a different round/day of the same series, or another week's session of a recurring club activity.

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
