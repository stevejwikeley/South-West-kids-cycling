"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { extractEvents, type ExtractedEvent } from "@/lib/ingestion/extract-events";
import { findDuplicate } from "@/lib/ingestion/dedup";
import { htmlToText, isLikelyUrl } from "@/lib/ingestion/html-to-text";
import type { EventRow } from "@/lib/supabase/types";

export interface IngestState {
  error?: string;
  success?: string;
}

// Basic SSRF guard: this fetch is admin-triggered with an admin-supplied
// URL, but it's still our server making the request — block obvious
// internal/private targets rather than trusting the caller's good faith.
function assertPublicHttpUrl(raw: string): URL {
  const url = new URL(raw);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http/https URLs are supported.");
  }
  const host = url.hostname.toLowerCase();
  const isPrivate =
    host === "localhost" ||
    host === "0.0.0.0" ||
    host.endsWith(".local") ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) ||
    host === "::1";
  if (isPrivate) throw new Error("That URL points at a private/internal address.");
  return url;
}

async function requireAdmin() {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "admin") throw new Error("Not authorised.");
  return profile;
}

async function saveCandidates(candidates: ExtractedEvent[], rawSourceRef: string, sourceUrl?: string) {
  const supabase = await createClient();

  const { data: liveEvents, error: liveError } = await supabase.from("events").select("*");
  if (liveError) throw new Error(liveError.message);

  let saved = 0;
  for (const candidate of candidates) {
    const duplicate = findDuplicate(candidate, (liveEvents as EventRow[]) ?? []);

    const { error } = await supabase.from("events_pending").insert({
      title: candidate.title,
      discipline: candidate.discipline,
      status: candidate.status ?? "confirmed",
      start_datetime: candidate.date ? `${candidate.date}T00:00:00.000Z` : null,
      all_day: candidate.all_day,
      venue_name: candidate.venue_name,
      address: candidate.address,
      postcode: candidate.postcode,
      region: candidate.region,
      age_categories: candidate.age_categories,
      kids_only: candidate.kids_only,
      booking_status: candidate.booking_status,
      booking_link: candidate.booking_link,
      // organiser_url is required to publish (it's the CTA while a booking
      // link isn't live yet) but posters/pasted text rarely state one. When
      // the source itself was a URL, that page is a reasonable fallback —
      // it's genuinely "the organiser's own site" for a scraped listing.
      organiser_url: candidate.organiser_url ?? sourceUrl ?? null,
      organiser_name: candidate.organiser_name,
      organiser_contact: candidate.organiser_contact,
      source_type: "smart_ingest",
      source_detail: rawSourceRef,
      raw_source_ref: rawSourceRef,
      extraction_confidence: candidate.confidence,
      duplicate_of: duplicate?.id ?? null,
    });

    if (!error) saved++;
  }

  return saved;
}

export async function ingestTextOrUrl(_prevState: IngestState, formData: FormData): Promise<IngestState> {
  try {
    await requireAdmin();
  } catch {
    return { error: "Not authorised." };
  }

  const input = String(formData.get("input") ?? "").trim();
  if (!input) return { error: "Paste a URL or some text first." };

  let text: string;
  let sourceRef: string;

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
    text = htmlToText(html).slice(0, 60000);
    sourceRef = url.toString();
  } else {
    text = input.slice(0, 60000);
    sourceRef = "pasted text";
  }

  let candidates: ExtractedEvent[];
  try {
    candidates = await extractEvents({ text });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Extraction failed." };
  }

  if (candidates.length === 0) {
    return { error: "No youth cycling events found in that content." };
  }

  const saved = await saveCandidates(candidates, sourceRef, isLikelyUrl(input) ? sourceRef : undefined);
  return { success: `${saved} event${saved === 1 ? "" : "s"} sent to the pending queue for review.` };
}

export async function ingestFile(_prevState: IngestState, formData: FormData): Promise<IngestState> {
  try {
    await requireAdmin();
  } catch {
    return { error: "Not authorised." };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a file first." };

  const MAX_BYTES = 8 * 1024 * 1024;
  if (file.size > MAX_BYTES) return { error: "File is too large (8MB max)." };

  let candidates: ExtractedEvent[];
  try {
    if (file.type.startsWith("image/")) {
      const mediaType = file.type as "image/png" | "image/jpeg" | "image/webp" | "image/gif";
      if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(mediaType)) {
        return { error: "Unsupported image type — use PNG, JPEG, WebP, or GIF." };
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      candidates = await extractEvents({ image: { base64: buffer.toString("base64"), mediaType } });
    } else {
      const text = (await file.text()).slice(0, 60000);
      candidates = await extractEvents({ text });
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Extraction failed." };
  }

  if (candidates.length === 0) {
    return { error: "No youth cycling events found in that file." };
  }

  const saved = await saveCandidates(candidates, `upload: ${file.name}`);
  return { success: `${saved} event${saved === 1 ? "" : "s"} sent to the pending queue for review.` };
}
