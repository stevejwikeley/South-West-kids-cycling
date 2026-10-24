import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import * as Sentry from "@sentry/nextjs";
import { htmlToText } from "@/lib/ingestion/html-to-text";

// Writes the event detail page's "Description" from whatever's on the
// organiser's own event page — used by the "Generate from source" button
// on every event-creation form (admin, organiser, public submit) and by the
// admin backfill panel. AI-ingested events (smart ingestion / paste-a-link)
// get this for free from extract-events.ts instead, since that pipeline
// already has the source text in hand — this is only for the paths that
// don't.

export interface GenerateDescriptionResult {
  description?: string;
  error?: string;
}

export async function generateEventDescription(url: string, title: string, venueName: string): Promise<GenerateDescriptionResult> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { error: "That doesn't look like a valid URL." };
  }

  const res = await fetch(parsed.toString(), {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; SWKidsCyclingBot/1.0)" },
    signal: AbortSignal.timeout(15000),
  }).catch(() => null);
  if (!res || !res.ok) return { error: "Couldn't fetch that URL." };

  const html = await res.text();
  const text = htmlToText(html, res.url).slice(0, 60000);
  if (!text.trim()) return { error: "That page didn't have any readable content." };

  return Sentry.startSpan(
    { name: "generateEventDescription", op: "gen_ai.event_description", attributes: { "description.url": url, "description.model": "claude-opus-5" } },
    async () => {
      const client = new Anthropic();

      let response;
      try {
        response = await client.messages.create({
          model: "claude-opus-5",
          max_tokens: 500,
          system: `You write the description shown on an event's page on South West Kids Cycling, a calendar of youth cycling events (ages 5-16) in Devon, Cornwall & Somerset, England. Most readers are a parent or a young rider deciding whether to turn up, often for the very first time.

Given the text of an event's own page and its title/venue, write a warm, welcoming, 2-4 sentence description that makes someone new want to come along: what actually happens (the format, rounds if it's part of a series, what riders can expect on the day), what makes it worth attending, and — if the source mentions it — anything that lowers the barrier for a first-timer (no experience needed, beginner-friendly, coached, sociable atmosphere, what to bring). Plain, accessible language, not jargon-heavy racing-insider language. Second or third person is both fine, but keep it genuinely inviting rather than corporate or promotional-sounding.

Only use what's actually in the source — never invent a fact (price, format detail, "beginner friendly" framing, etc.) that isn't there. If the page doesn't say much beyond the title/venue, it's fine to keep the description short and lead with whatever context you do have (discipline, age range) rather than padding it out. Reply with only the description text, no preamble, quotes, or markdown.`,
          messages: [
            {
              role: "user",
              content: `Event: "${title}" at ${venueName}\n\nPage content:\n${text}`,
            },
          ],
        });
      } catch (e) {
        Sentry.captureException(e, { tags: { operation: "generate_event_description" } });
        return { error: "Generation failed — try again, or write it yourself." };
      }

      const block = response.content.find((b) => b.type === "text");
      const description = block?.type === "text" ? block.text.trim() : "";
      if (!description) return { error: "Generation produced nothing usable — try again, or write it yourself." };

      return { description };
    }
  );
}
