"use server";

import * as Sentry from "@sentry/nextjs";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { extractEvents, type ExtractedEvent } from "@/lib/ingestion/extract-events";
import { saveCandidates } from "@/lib/ingestion/save-candidates";
import { htmlToText, isLikelyUrl } from "@/lib/ingestion/html-to-text";

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

export async function ingestTextOrUrl(_prevState: IngestState, formData: FormData): Promise<IngestState> {
  try {
    await requireAdmin();
  } catch {
    return { error: "Not authorised." };
  }

  const input = String(formData.get("input") ?? "").trim();
  if (!input) return { error: "Paste a URL or some text first." };

  // Set by the ingest bookmarklet: the page's own URL, captured alongside
  // its text since the text itself was pasted (not fetched), so there'd
  // otherwise be no organiser_url fallback for a Cloudflare-blocked source
  // the way there is for the plain "paste a URL" path below.
  const suppliedSourceUrl = String(formData.get("source_url") ?? "").trim();
  if (suppliedSourceUrl) {
    try {
      const parsed = new URL(suppliedSourceUrl);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return { error: "Source URL must be http/https." };
      }
    } catch {
      return { error: "That source URL doesn't look valid." };
    }
  }

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
    sourceRef = url.toString();
    organiserUrlFallback = sourceRef;
  } else {
    text = input.slice(0, 60000);
    sourceRef = suppliedSourceUrl || "pasted text";
    organiserUrlFallback = suppliedSourceUrl || undefined;
  }

  let candidates: ExtractedEvent[];
  try {
    candidates = await Sentry.startSpan(
      { name: `ingestTextOrUrl: ${sourceRef}`, op: "ingestion.manual", attributes: { "source.ref": sourceRef } },
      () => extractEvents({ text })
    );
  } catch (e) {
    Sentry.captureException(e, { tags: { operation: "ingest_text_or_url" } });
    return { error: e instanceof Error ? e.message : "Extraction failed." };
  }

  if (candidates.length === 0) {
    return { error: "No youth cycling events found in that content." };
  }

  const supabase = await createClient();
  const saved = await saveCandidates(supabase, candidates, sourceRef, organiserUrlFallback);
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

  const organiserUrl = String(formData.get("organiser_url") ?? "").trim() || undefined;
  if (organiserUrl) {
    try {
      const parsed = new URL(organiserUrl);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return { error: "Organiser URL must be http/https." };
      }
    } catch {
      return { error: "That doesn't look like a valid organiser URL." };
    }
  }

  let candidates: ExtractedEvent[];
  try {
    candidates = await Sentry.startSpan(
      { name: `ingestFile: ${file.name}`, op: "ingestion.manual", attributes: { "source.ref": `upload: ${file.name}`, "file.type": file.type, "file.size": file.size } },
      async () => {
        if (file.type.startsWith("image/")) {
          const mediaType = file.type as "image/png" | "image/jpeg" | "image/webp" | "image/gif";
          if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(mediaType)) {
            throw new Error("Unsupported image type — use PNG, JPEG, WebP, or GIF.");
          }
          const buffer = Buffer.from(await file.arrayBuffer());
          return extractEvents({ image: { base64: buffer.toString("base64"), mediaType } });
        }
        const text = (await file.text()).slice(0, 60000);
        return extractEvents({ text });
      }
    );
  } catch (e) {
    Sentry.captureException(e, { tags: { operation: "ingest_file" } });
    return { error: e instanceof Error ? e.message : "Extraction failed." };
  }

  if (candidates.length === 0) {
    return { error: "No youth cycling events found in that file." };
  }

  const supabase = await createClient();
  const saved = await saveCandidates(supabase, candidates, `upload: ${file.name}`, organiserUrl);
  return { success: `${saved} event${saved === 1 ? "" : "s"} sent to the pending queue for review.` };
}
