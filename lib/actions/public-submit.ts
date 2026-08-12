"use server";

import * as Sentry from "@sentry/nextjs";
import { createClient } from "@/lib/supabase/server";
import { extractEvents, type ExtractedEvent } from "@/lib/ingestion/extract-events";
import { saveCandidates } from "@/lib/ingestion/save-candidates";
import { htmlToText, isLikelyUrl } from "@/lib/ingestion/html-to-text";
import { assertPublicHttpUrl } from "@/lib/ingestion/url-guard";
import { parseEventForm } from "./parse-event-form";

export interface PublicSubmitState {
  error?: string;
  success?: string;
}

// Public counterpart to ingestTextOrUrl (lib/actions/ingest.ts) — same
// fetch/extract/dedup/save pipeline, no admin check, and tagged
// source_type: "public_submission" rather than "smart_ingest" purely so the
// pending queue can show admins where a candidate came from. Shared by the
// /submit-event page and the contact form's "Add event" reason — channel
// only affects how the pending row's source is labeled for admins.
export async function submitEventText(input: string, channel = "public submission"): Promise<PublicSubmitState> {
  input = input.trim();
  if (!input) return { error: "Paste a URL or some text first." };

  let text: string;
  let sourceRef: string;
  let organiserUrlFallback: string | undefined;

  if (isLikelyUrl(input)) {
    let url: URL;
    try {
      url = assertPublicHttpUrl(input);
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Invalid URL." };
    }

    const res = await fetch(url.toString(), {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SWKidsCyclingBot/1.0)" },
      signal: AbortSignal.timeout(15000),
    }).catch(() => null);

    if (!res || !res.ok) return { error: "Couldn't fetch that URL." };
    const html = await res.text();
    text = htmlToText(html, res.url).slice(0, 60000);
    sourceRef = `${channel}: ${url.toString()}`;
    organiserUrlFallback = url.toString();
  } else {
    text = input.slice(0, 60000);
    sourceRef = `${channel} (pasted text)`;
  }

  let candidates: ExtractedEvent[];
  try {
    candidates = await Sentry.startSpan(
      { name: `submitEventText: ${sourceRef}`, op: "ingestion.public_submission", attributes: { "source.ref": sourceRef } },
      () => extractEvents({ text })
    );
  } catch (e) {
    Sentry.captureException(e, { tags: { operation: "submit_event_text" } });
    return { error: e instanceof Error ? e.message : "Extraction failed." };
  }

  if (candidates.length === 0) {
    return { error: "No youth cycling events found in that content — try the form instead?" };
  }

  const supabase = await createClient();
  const saved = await saveCandidates(supabase, candidates, sourceRef, organiserUrlFallback, undefined, "public_submission");
  if (saved === 0) {
    return { error: "That looks like it's already in the calendar or pending review." };
  }
  return { success: `Thanks — sent for review. ${saved === 1 ? "It'll" : "They'll"} appear on the calendar once an admin checks ${saved === 1 ? "it" : "them"} over.` };
}

export async function submitPublicUrlOrText(_prevState: PublicSubmitState, formData: FormData): Promise<PublicSubmitState> {
  return submitEventText(String(formData.get("input") ?? ""));
}

// Structured-form counterpart — same pending-queue destination and approval
// path as the URL/text version above, just skipping the AI extraction step
// since the fields are already typed in directly. confidence: 1 reflects
// that this is a human-entered, not machine-guessed, record.
export async function submitPublicEventForm(_prevState: PublicSubmitState, formData: FormData): Promise<PublicSubmitState> {
  const parsed = parseEventForm(formData);
  if (!parsed.ok) return { error: parsed.error };

  const candidate: ExtractedEvent = {
    title: parsed.values.title,
    discipline: parsed.values.discipline,
    status: parsed.values.status,
    date: parsed.values.start_datetime.slice(0, 10),
    venue_name: parsed.values.venue_name,
    address: parsed.values.address,
    postcode: parsed.values.postcode,
    region: parsed.values.region,
    age_categories: parsed.values.age_categories,
    kids_only: parsed.values.kids_only,
    booking_status: parsed.values.booking_status,
    booking_link: parsed.values.booking_link,
    organiser_url: parsed.values.organiser_url,
    organiser_name: parsed.values.organiser_name,
    organiser_contact: parsed.values.organiser_contact,
    confidence: 1,
    low_confidence_fields: [],
  };

  const supabase = await createClient();
  const saved = await saveCandidates(supabase, [candidate], "public submission (form)", undefined, undefined, "public_submission");
  if (saved === 0) {
    return { error: "That looks like it's already in the calendar or pending review." };
  }
  return { success: "Thanks — sent for review. It'll appear on the calendar once an admin checks it over." };
}
