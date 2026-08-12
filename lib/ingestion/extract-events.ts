import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import * as Sentry from "@sentry/nextjs";

// One shared extraction engine reused for every unstructured source —
// spreadsheet, poster image, pasted URL/text — per spec section 3/7.2.
// Each input format is normalized to either a text or image content block
// before reaching this single function; there is no per-source parsing logic
// beyond that normalization.

const DISCIPLINES = ["cx", "xc", "road", "tri", "gravel", "duathlon", "clusters", "other"] as const;
const STATUSES = ["confirmed", "provisional", "cancelled"] as const;
const REGIONS = ["devon", "cornwall", "both"] as const;
const AGE_CATEGORIES = ["u8", "u10", "u12", "u14", "u16"] as const;
const BOOKING_STATUSES = ["open", "planned"] as const;

const ExtractedEventSchema = z.object({
  title: z.string(),
  discipline: z.enum(DISCIPLINES).nullable(),
  status: z.enum(STATUSES).nullable(),
  date: z.string().nullable().describe("ISO date YYYY-MM-DD. Null if no date is legible."),
  venue_name: z.string().nullable(),
  address: z.string().nullable(),
  postcode: z.string().nullable(),
  region: z.enum(REGIONS).nullable().describe("Infer from venue/address if it clearly indicates Devon or Cornwall; otherwise null."),
  age_categories: z.array(z.enum(AGE_CATEGORIES)),
  kids_only: z.boolean().nullable(),
  booking_status: z.enum(BOOKING_STATUSES).nullable(),
  booking_link: z.string().nullable(),
  organiser_url: z.string().nullable(),
  organiser_name: z.string().nullable(),
  organiser_contact: z.string().nullable(),
  confidence: z
    .number()
    .describe("0-1: overall confidence this is a real event and the extracted fields are accurate. Lower for ambiguous, partial, or hard-to-read source content."),
  low_confidence_fields: z
    .array(z.string())
    .describe("Field names (matching the schema keys above) that ARE populated but you're not fully sure are correct — e.g. an address inferred from a venue name rather than stated outright. Don't list fields you left null; this is only for populated-but-uncertain values, so a human reviewer knows exactly what to double-check."),
});

const ExtractionResultSchema = z.object({
  events: z.array(ExtractedEventSchema),
});

export type ExtractedEvent = z.infer<typeof ExtractedEventSchema>;
export { ExtractedEventSchema };

function buildSystemPrompt(): string {
  const today = new Date().toISOString().slice(0, 10);

  return `You extract youth cycling event listings for South West Kids Cycling, a calendar covering ages 5-16 in Devon & Cornwall, England. Today's date is ${today}.

Extract every distinct event you find in the given content (a page, poster, or pasted text may list several rounds of a series — extract each as a separate entry).

Rules:
- Only extract events happening on or after ${today}. Skip anything dated in the past — this calendar only lists upcoming events, so a past listing (e.g. last year's round of a series, an old training session) is not useful even if it's otherwise a good match. If a date can't be determined at all, still extract the event (a human will confirm the date).
- Only extract youth/junior cycling events, club coaching sessions, or events that clearly include age-group categories for under-16s. Skip adult-only road racing, enduro, and anything outside Devon/Cornwall.
- Leave a field null rather than guessing. A poster rarely states exact time, address, or a booking link — leave those null for a human reviewer rather than inventing plausible-looking values.
- Links extracted from a web page appear inline right after their link text, as "text (URL)" — e.g. a listing page with a "VIEW EVENT" button per row shows up as "…Woodbury Common VIEW EVENT (https://example.com/events/devon-grit/)". Match each link to the event it's positioned next to (by proximity/order in the text, not by the link text itself, which is often identical and generic across every row, like "VIEW EVENT" or "Book now"). Use it as booking_link if it goes to a registration/entry page, otherwise organiser_url.
- Disciplines: cx (cyclocross), xc (cross country mountain biking), road, tri (triathlon), gravel (gravel racing), duathlon (run-bike-run), clusters (club coaching/training sessions, "Go-Ride" style), other. Skip events with no cycling leg at all (a pure running race, swim event, etc.) — this calendar only covers cycling and cycling-adjacent multisport.
- Age categories are u8/u10/u12/u14/u16. If the source states or clearly implies specific ages, use those (e.g. "Under 10s and Under 12s" → ["u10","u12"]). If it's a kids/youth race with no age information at all, default to every category (["u8","u10","u12","u14","u16"]) — except gravel, which is usually unsuitable for the youngest riders given the distances involved, so default to ["u12","u14","u16"] instead.
- Every event on this calendar is treated as all-day — don't extract or infer a start/end time even if the source states one.
- confidence should reflect the whole event: high when title, date, venue and discipline are all clear and unambiguous; low when you had to infer significantly or the source is degraded/ambiguous.
- low_confidence_fields flags individual populated fields you're unsure about (e.g. you inferred a postcode from a venue name rather than reading it directly) — this is separate from confidence and from leaving a field null; it's for values you filled in but aren't fully sure are right.
- If nothing in the content is a relevant event, return an empty events array.`;
}

interface ExtractOptions {
  text?: string;
  image?: { base64: string; mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif" };
}

export async function extractEvents({ text, image }: ExtractOptions): Promise<ExtractedEvent[]> {
  if (!text && !image) throw new Error("extractEvents requires text or image content.");

  return Sentry.startSpan(
    {
      name: "extractEvents",
      op: "gen_ai.extract_events",
      attributes: {
        "extract.input_type": image ? "image" : "text",
        "extract.input_length": image ? image.base64.length : (text?.length ?? 0),
        "extract.model": "claude-opus-5",
      },
    },
    async (span) => {
      const client = new Anthropic();

      const content: Anthropic.Messages.ContentBlockParam[] = [];
      if (image) {
        content.push({
          type: "image",
          source: { type: "base64", media_type: image.mediaType, data: image.base64 },
        });
      }
      content.push({
        type: "text",
        text: text ?? "Extract every youth cycling event visible in this image.",
      });

      let response;
      try {
        response = await client.messages.parse({
          model: "claude-opus-5",
          max_tokens: 8000,
          system: buildSystemPrompt(),
          output_config: { effort: "medium", format: zodOutputFormat(ExtractionResultSchema) },
          messages: [{ role: "user", content }],
        });
      } catch (e) {
        Sentry.captureException(e, { tags: { operation: "extract_events" } });
        throw e;
      }

      if (response.usage) {
        span.setAttribute("extract.input_tokens", response.usage.input_tokens);
        span.setAttribute("extract.output_tokens", response.usage.output_tokens);
      }

      if (!response.parsed_output) {
        const err = new Error("Extraction failed to produce valid output.");
        Sentry.captureException(err, { tags: { operation: "extract_events" } });
        throw err;
      }

      const events = response.parsed_output.events;
      span.setAttribute("extract.event_count", events.length);
      if (events.length > 0) {
        span.setAttribute("extract.avg_confidence", events.reduce((sum, e) => sum + e.confidence, 0) / events.length);
        span.setAttribute("extract.low_confidence_field_count", events.reduce((sum, e) => sum + e.low_confidence_fields.length, 0));
      }

      return events;
    }
  );
}
