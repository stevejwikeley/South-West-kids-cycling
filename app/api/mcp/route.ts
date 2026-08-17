import "server-only";
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { saveCandidates } from "@/lib/ingestion/save-candidates";
import { ExtractedEventSchema } from "@/lib/ingestion/extract-events";
import { EVENT_DISCIPLINES } from "@/lib/mock-data";
import type { EventRow, EventPendingRow } from "@/lib/supabase/types";

// Lets a user-driven Claude session (e.g. a weekly Claude schedule) search
// the web itself for new youth cycling events and queue candidates for
// review — the same events_pending review flow as smart ingestion and
// "suggest a change" (spec section 3/7.2), just without a watched source or
// Anthropic-hosted web_search call in the middle. This app never searches
// the web on its own; it only exposes what's already known (to steer the
// caller away from duplicates) and a way to submit a candidate.

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "get_search_context",
      {
        title: "Get event search context",
        description:
          "Returns what this calendar is looking for (region, disciplines, age groups) plus every event already published or already queued for review, so a web search for new events can target the gaps and avoid re-submitting duplicates. Call this before searching.",
        inputSchema: z.object({}),
      },
      async () => {
        const supabase = createAdminClient();
        const today = new Date().toISOString().slice(0, 10);

        const [{ data: liveEvents }, { data: pendingRows }] = await Promise.all([
          supabase
            .from("events")
            .select("title, start_datetime, venue_name, discipline, region")
            .gte("start_datetime", today)
            .order("start_datetime", { ascending: true }),
          supabase
            .from("events_pending")
            .select("title, start_datetime, venue_name, discipline, region, source_type")
            .order("created_at", { ascending: true }),
        ]);

        const context = {
          scope: "Youth cycling events (ages 5-16) in Devon, Cornwall & Somerset, England — races, series rounds, and club coaching/cluster sessions.",
          disciplines: EVENT_DISCIPLINES.map((d) => d.id),
          regions: ["devon", "cornwall", "somerset", "both"],
          age_categories: ["u8", "u10", "u12", "u14", "u16"],
          rules: [
            "Only in-scope: youth/junior cycling races, club coaching sessions, or events with clear under-16 age categories, in Devon, Cornwall, or Somerset.",
            "Skip adult-only racing and anything outside those counties.",
            "Only future events (today is " + today + ").",
            "Leave a field null rather than guessing — a human reviewer checks every submission before it goes live.",
            "Age categories default to every category (u8-u16) when unstated, except gravel which defaults to u12-u16 (usually unsuitable for the youngest riders).",
            "Every event is treated as all-day — don't extract or infer a time.",
          ],
          already_upcoming_on_calendar: ((liveEvents as Pick<EventRow, "title" | "start_datetime" | "venue_name" | "discipline" | "region">[] | null) ?? []).map((e) => ({
            title: e.title,
            date: e.start_datetime.slice(0, 10),
            venue: e.venue_name,
            discipline: e.discipline,
            region: e.region,
          })),
          already_queued_for_review: ((pendingRows as Pick<EventPendingRow, "title" | "start_datetime" | "venue_name" | "discipline" | "region" | "source_type">[] | null) ?? []).map((e) => ({
            title: e.title,
            date: e.start_datetime?.slice(0, 10) ?? null,
            venue: e.venue_name,
            discipline: e.discipline,
            region: e.region,
            queued_via: e.source_type,
          })),
        };

        return { content: [{ type: "text", text: JSON.stringify(context, null, 2) }] };
      }
    );

    server.registerTool(
      "submit_event_candidate",
      {
        title: "Submit an event candidate",
        description:
          "Queues one event you found for human review on the admin pending page — it does not publish directly. Call get_search_context first so you know what's already covered. Duplicates of a live or already-queued event are silently skipped (checked by title/date/venue similarity), so it's safe to submit anything that looks like a plausible match.",
        inputSchema: z.object({
          event: ExtractedEventSchema,
          source_url: z.string().describe("The page you found this event on — used as a fallback organiser link if the event itself has none.").optional(),
        }),
      },
      async ({ event, source_url }) => {
        const supabase = createAdminClient();
        const saved = await saveCandidates(supabase, [event], "mcp-web-search", source_url);
        return {
          content: [
            {
              type: "text",
              text:
                saved > 0
                  ? `Queued "${event.title}" for review.`
                  : `Skipped "${event.title}" — it matches a live or already-queued event.`,
            },
          ],
        };
      }
    );
  },
  {
    serverInfo: { name: "sw-kids-cycling-ingestion", version: "1.0.0" },
    instructions:
      "Tools for finding new youth cycling events for South West Kids Cycling (southwestkidscycling.uk). Call get_search_context first, search the web yourself for events matching the criteria it returns, then call submit_event_candidate for anything that looks like a genuine match. Submissions land in a human review queue, not the live calendar.",
  }
);

const authedHandler = withMcpAuth(
  handler,
  (_req, bearerToken) => {
    const secret = process.env.MCP_SECRET;
    if (!secret || bearerToken !== secret) return undefined;
    return { token: bearerToken, clientId: "sw-kids-cycling-owner", scopes: [] };
  },
  { required: true }
);

export { authedHandler as GET, authedHandler as POST };
