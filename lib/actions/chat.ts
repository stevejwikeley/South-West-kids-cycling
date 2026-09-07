"use server";

import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import * as Sentry from "@sentry/nextjs";
import { getClubs, getEvents } from "@/lib/data";
import { eventDisc } from "@/lib/mock-data";
import { WHATSAPP_LINK } from "@/lib/whatsapp";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatResult {
  reply?: string;
  error?: string;
}

const MAX_HISTORY = 12;
const MAX_MESSAGE_LENGTH = 1000;

const DISCIPLINE_GUIDE = `- Cyclocross (cx): short, muddy off-road laps with obstacles, age-graded, often 10-20 min. The friendliest discipline for a first race — any off-road-capable bike works, no dedicated cyclocross bike needed.
- XC (xc): cross-country mountain biking on natural/purpose-built trails, more technical than cx. Needs a mountain bike or hybrid.
- Road: closed-circuit or traffic-managed tarmac racing. Needs a road or hybrid bike and a proper helmet.
- Triathlon (tri): swim, bike, run over junior-scaled distances.
- Gravel: longer off-road rides on unsurfaced tracks, endurance-focused. Usually u12+ given the distances.
- Duathlon: run, bike, run — no swim leg, less kit than triathlon.
- Clusters: club coaching/training sessions ("Go-Ride" style), not races.
- Other: one-off taster days or anything that doesn't fit elsewhere — check the listing.

Cyclocross, XC and road races run under British Cycling rules need a race licence (a British Cycling membership, with cheaper under-12/youth/junior tiers), but most events sell a one-off day licence at registration so families can try racing before joining.`;

async function buildKnowledgeBase(): Promise<string> {
  const today = new Date().toISOString().slice(0, 10);

  let eventLines = "(couldn't load live event data right now)";
  try {
    const events = await getEvents();
    eventLines =
      events
        .slice(0, 60)
        .map((e) => {
          const disc = eventDisc(e.discipline).label;
          const ages = e.ages.length ? e.ages.join("/").toUpperCase() : "unspecified";
          const kids = e.kidsOnly ? "kids only" : "kids + adults";
          const booking = e.bookingStatus === "open" ? "entries open" : "entries TBC";
          return `${e.date} | ${disc} | ${e.title} | ${e.venue}, ${e.region} | ${kids} | ages ${ages} | ${booking} | status: ${e.status}`;
        })
        .join("\n") || "(no upcoming events currently listed)";
  } catch (e) {
    Sentry.captureException(e, { tags: { operation: "chat_assistant_load_events" } });
  }

  let clubLines = "(couldn't load club data right now)";
  try {
    const clubs = await getClubs();
    clubLines =
      clubs
        .map((c) => `${c.name} | ${c.location} | ${c.disciplines.join("/")}${c.website ? ` | ${c.website}` : ""}`)
        .join("\n") || "(no clubs currently listed)";
  } catch (e) {
    Sentry.captureException(e, { tags: { operation: "chat_assistant_load_clubs" } });
  }

  return `Today's date is ${today}.

--- Disciplines ---
${DISCIPLINE_GUIDE}

--- Subscribing ---
At /subscribe: subscribe the calendar (ICS feed) into any calendar app, which then updates itself automatically, or sign up for a monthly email digest instead — no calendar app required.

--- Finding a first race / getting started ---
Turning up to a race is the best first step — clubs and organisers on this calendar go out of their way to welcome first-timers. Joining a nearby club (see /clubs) is a good way to ease in gradually and meet other families. On the calendar, "kids only" vs "kids + adults" shows whether a child races in a fully separate event; "entries open" vs "entries TBC" shows whether booking is live yet.

--- Submitting or correcting an event ---
Anyone can suggest a new event or flag a correction via the "Suggest a change" link on an event, the /submit-event page, or the general enquiry form at /contact.

--- Upcoming events (as of ${today}, chronological, showing at most 60) ---
${eventLines}

--- Clubs ---
${clubLines}`;
}

function buildSystemPrompt(knowledgeBase: string): string {
  return `You are the help assistant embedded on South West Kids Cycling (southwestkidscycling.uk), a public calendar of youth cycling races and events (cyclocross, XC, road, triathlon, gravel, duathlon, and club training sessions) for ages 5-16 across Devon, Cornwall & Somerset, England.

Answer questions from parents and young riders about the disciplines, what to expect and bring, British Cycling membership, subscribing to the calendar, finding a club, submitting or correcting events, and specific events or clubs from the data below.

Ground every factual answer only in the information given below — never invent a date, venue, price, or booking link. If someone asks about an event or club that isn't listed below, say you don't have that information rather than guessing.

${knowledgeBase}

Style: 2-4 short sentences, plain English, UK spelling, no markdown headers or tables. A short bullet list is fine for multi-part answers.

Fallback: if you don't know the answer, the question needs a real person (a specific booking problem, a complaint, anything time-sensitive not covered above), or the person asks to speak to someone, tell them to message on WhatsApp and give this exact link: ${WHATSAPP_LINK}. Never invent any other contact details, and never claim to be human.`;
}

export async function askChatbot(history: ChatMessage[]): Promise<ChatResult> {
  const trimmed = history
    .filter((m) => (m.role === "user" || m.role === "assistant") && m.content.trim().length > 0)
    .slice(-MAX_HISTORY);

  if (trimmed.length === 0 || trimmed[trimmed.length - 1].role !== "user") {
    return { error: "Ask me something first." };
  }
  if (trimmed.some((m) => m.content.length > MAX_MESSAGE_LENGTH)) {
    return { error: "That message is a bit long — could you shorten it?" };
  }

  return Sentry.startSpan(
    { name: "askChatbot", op: "gen_ai.chat", attributes: { "chat.model": "claude-haiku-4-5-20251001" } },
    async (span) => {
      const client = new Anthropic();

      let response;
      try {
        const system = buildSystemPrompt(await buildKnowledgeBase());
        response = await client.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 400,
          system,
          messages: trimmed.map((m) => ({ role: m.role, content: m.content })),
        });
      } catch (e) {
        Sentry.captureException(e, { tags: { operation: "chat_assistant" } });
        return { error: `Sorry, something went wrong answering that. You can message us on WhatsApp instead: ${WHATSAPP_LINK}` };
      }

      if (response.usage) {
        span.setAttribute("chat.input_tokens", response.usage.input_tokens);
        span.setAttribute("chat.output_tokens", response.usage.output_tokens);
      }

      const reply = response.content.find((block) => block.type === "text")?.text?.trim();
      if (!reply) {
        return { error: `Sorry, I couldn't come up with an answer to that. You can message us on WhatsApp instead: ${WHATSAPP_LINK}` };
      }

      return { reply };
    }
  );
}
