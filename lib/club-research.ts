import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import * as Sentry from "@sentry/nextjs";

// Looks up a youth cycling club by name using Claude's web_search tool, so
// an admin/organiser adding a club doesn't have to hunt down its website,
// location and disciplines by hand. This only ever prefills a form the
// human still reviews and submits themselves — same "propose, don't
// auto-publish" posture as lib/ingestion/extract-events.ts, just for clubs
// instead of events.

const CLUB_DISCIPLINES = ["road", "xc", "cx"] as const;

const ClubResearchSchema = z.object({
  found: z.boolean().describe("True only if you found a real, specific club matching the given name — not a generic guess."),
  name: z.string().nullable().describe("The club's full, correctly capitalized name as it appears on its own site."),
  location: z.string().nullable().describe("Town/area, e.g. \"Newton Abbot, Devon\" — not a full postal address."),
  website: z.string().nullable(),
  disciplines: z.array(z.enum(CLUB_DISCIPLINES)).describe("Which of road/xc (cross country mountain biking)/cx (cyclocross) the club's youth section actually covers. Empty array if unclear."),
  age_note: z.string().nullable().describe("Short note on the youth offering, e.g. \"Go-Ride youth section, ages 8-16\"."),
  kids_only: z.boolean().nullable().describe("True only if the club has no separate adult racing programme at all — most clubs with a junior section still have adults too, so this is false far more often than true."),
  founded: z.string().nullable().describe("Founding year, only if explicitly stated somewhere."),
  summary: z.string().nullable().describe("One or two sentences a parent would find useful — what the club offers, notable history. Neutral, factual tone matching a directory listing, not marketing copy."),
  low_confidence_fields: z.array(z.string()).describe("Field names you're populating but aren't fully sure about."),
});

export type ClubResearchResult = z.infer<typeof ClubResearchSchema>;

function buildSystemPrompt(): string {
  return `You research youth cycling clubs for South West Kids Cycling, a directory of clubs with junior/youth sections (ages 5-16) in Devon, Cornwall & Somerset, England.

Given a club name (and possibly an approximate area), search the web to find that specific club's own website or social presence and fill in what you can verify. Rules:
- Only set found: true if you're confident you found the actual club, not a same-named club elsewhere in the country or an unrelated result.
- Leave a field null rather than guessing — a club's official site rarely states every detail, and this calendar's directory only shows a handful of fields, so it's fine to leave most of them null if you can't verify them.
- disciplines only covers road / xc (cross country mountain biking) / cx (cyclocross) — this directory doesn't track other disciplines for clubs (unlike events). If the club also does triathlon, gravel, etc., that doesn't map to any of these three and shouldn't be inferred as one of them.
- summary should read like a directory entry (factual, third person, one or two sentences) — not promotional copy lifted from the club's own homepage.
- If you can't find the club at all, or aren't confident the result you found is the right one, return found: false and leave every other field null.`;
}

export async function researchClub(name: string): Promise<ClubResearchResult> {
  return Sentry.startSpan(
    { name: "researchClub", op: "gen_ai.research_club", attributes: { "research.club_name": name, "research.model": "claude-opus-5" } },
    async (span) => {
      const client = new Anthropic();

      let response;
      try {
        response = await client.messages.parse({
          model: "claude-opus-5",
          max_tokens: 4000,
          system: buildSystemPrompt(),
          tools: [{ type: "web_search_20260318", name: "web_search", max_uses: 5 }],
          output_config: { effort: "medium", format: zodOutputFormat(ClubResearchSchema) },
          messages: [{ role: "user", content: `Look up the youth cycling club "${name}" in Devon, Cornwall, or Somerset, England.` }],
        });
      } catch (e) {
        Sentry.captureException(e, { tags: { operation: "research_club" } });
        throw e;
      }

      if (response.usage) {
        span.setAttribute("research.input_tokens", response.usage.input_tokens);
        span.setAttribute("research.output_tokens", response.usage.output_tokens);
      }

      if (!response.parsed_output) {
        const err = new Error("Club research failed to produce valid output.");
        Sentry.captureException(err, { tags: { operation: "research_club" } });
        throw err;
      }

      span.setAttribute("research.found", response.parsed_output.found);
      return response.parsed_output;
    }
  );
}
