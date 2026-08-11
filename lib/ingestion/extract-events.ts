import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

// One shared extraction engine reused for every unstructured source —
// spreadsheet, poster image, pasted URL/text — per spec section 3/7.2.
// Each input format is normalized to either a text or image content block
// before reaching this single function; there is no per-source parsing logic
// beyond that normalization.

const DISCIPLINES = ["cx", "xc", "road", "tri", "clusters", "other"] as const;
const STATUSES = ["confirmed", "provisional", "cancelled"] as const;
const REGIONS = ["devon", "cornwall", "both"] as const;
const AGE_CATEGORIES = ["u8", "u10", "u12", "u14", "u16"] as const;
const BOOKING_STATUSES = ["open", "planned"] as const;

const ExtractedEventSchema = z.object({
  title: z.string(),
  discipline: z.enum(DISCIPLINES).nullable(),
  status: z.enum(STATUSES).nullable(),
  date: z.string().nullable().describe("ISO date YYYY-MM-DD. Null if no date is legible."),
  all_day: z.boolean(),
  start_time: z.string().nullable().describe("24-hour HH:MM. Null if no specific time is given."),
  end_time: z.string().nullable(),
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
});

const ExtractionResultSchema = z.object({
  events: z.array(ExtractedEventSchema),
});

export type ExtractedEvent = z.infer<typeof ExtractedEventSchema>;

const SYSTEM_PROMPT = `You extract youth cycling event listings for South West Kids Cycling, a calendar covering ages 5-16 in Devon & Cornwall, England.

Extract every distinct event you find in the given content (a page, poster, or pasted text may list several rounds of a series — extract each as a separate entry).

Rules:
- Only extract youth/junior cycling events, club coaching sessions, or events that clearly include age-group categories for under-16s. Skip adult-only road racing, enduro, and anything outside Devon/Cornwall.
- Leave a field null rather than guessing. A poster rarely states exact time, address, or a booking link — leave those null for a human reviewer rather than inventing plausible-looking values.
- Disciplines: cx (cyclocross), xc (cross country mountain biking), road, tri (triathlon), clusters (club coaching/training sessions, "Go-Ride" style), other.
- Age categories are u8/u10/u12/u14/u16 — only include ones explicitly stated or clearly implied (e.g. "Under 10s and Under 12s" → ["u10","u12"]).
- all_day must be true unless the source states an actual start time — if you set all_day to false, start_time must be non-null. Most listings only give a date, not a time, so all_day is usually true.
- confidence should reflect the whole event: high when title, date, venue and discipline are all clear and unambiguous; low when you had to infer significantly or the source is degraded/ambiguous.
- If nothing in the content is a relevant event, return an empty events array.`;

interface ExtractOptions {
  text?: string;
  image?: { base64: string; mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif" };
}

export async function extractEvents({ text, image }: ExtractOptions): Promise<ExtractedEvent[]> {
  if (!text && !image) throw new Error("extractEvents requires text or image content.");

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

  const response = await client.messages.parse({
    model: "claude-opus-5",
    max_tokens: 8000,
    system: SYSTEM_PROMPT,
    output_config: { effort: "medium", format: zodOutputFormat(ExtractionResultSchema) },
    messages: [{ role: "user", content }],
  });

  if (!response.parsed_output) {
    throw new Error("Extraction failed to produce valid output.");
  }

  return response.parsed_output.events;
}
