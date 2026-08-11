import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { extractEvents } from "./extract-events";
import { saveCandidates } from "./save-candidates";
import { htmlToText } from "./html-to-text";
import type { Database, WatchedSourceRow } from "@/lib/supabase/types";

// Shared by the nightly cron and the admin "check now" button — one fetch +
// extract + status-update path either way, so a manual check and a cron run
// mean exactly the same thing.

function isPrivateHost(host: string): boolean {
  return (
    host === "localhost" ||
    host === "0.0.0.0" ||
    host.endsWith(".local") ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) ||
    host === "::1"
  );
}

export interface CheckSourceResult {
  status: "ok" | "error";
  error?: string;
  found?: number;
  saved?: number;
}

export async function checkWatchedSource(
  supabase: SupabaseClient<Database>,
  source: WatchedSourceRow
): Promise<CheckSourceResult> {
  try {
    const url = new URL(source.url);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("Only http/https URLs are supported.");
    }
    if (isPrivateHost(url.hostname.toLowerCase())) {
      throw new Error("That URL points at a private/internal address.");
    }

    const res = await fetch(url.toString(), {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SWKidsCyclingBot/1.0)" },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) {
      throw new Error(`Site returned HTTP ${res.status} — it may be blocking automated requests. Try pasting the page text on the Smart Ingestion page instead.`);
    }

    const text = htmlToText(await res.text(), res.url).slice(0, 60000);
    const candidates = await extractEvents({ text });
    const saved = await saveCandidates(supabase, candidates, source.label, source.url);

    await supabase
      .from("watched_sources")
      .update({
        last_checked_at: new Date().toISOString(),
        last_result_count: candidates.length,
        last_seen_events: { titles: candidates.map((c) => c.title) },
        last_status: "ok",
        last_error: null,
      })
      .eq("id", source.id);

    return { status: "ok", found: candidates.length, saved };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    await supabase
      .from("watched_sources")
      .update({ last_checked_at: new Date().toISOString(), last_status: "error", last_error: message })
      .eq("id", source.id);
    return { status: "error", error: message };
  }
}
