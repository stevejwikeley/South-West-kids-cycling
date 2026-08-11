import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractEvents } from "@/lib/ingestion/extract-events";
import { saveCandidates } from "@/lib/ingestion/save-candidates";
import { htmlToText } from "@/lib/ingestion/html-to-text";
import type { WatchedSourceRow } from "@/lib/supabase/types";

// Sequential, not parallel: each source costs one Claude extraction call, and
// this all has to fit inside one invocation's time budget. Fine for a
// handful of sources; revisit (fan out to per-source invocations) if the
// watched list grows large enough to threaten maxDuration.
export const maxDuration = 60;

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

function isDue(source: WatchedSourceRow): boolean {
  if (!source.last_checked_at) return true;
  if (source.check_frequency !== "weekly") return true;
  const daysSince = (Date.now() - new Date(source.last_checked_at).getTime()) / 86400000;
  return daysSince >= 7;
}

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase.from("watched_sources").select("*");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const sources = ((data as WatchedSourceRow[]) ?? []).filter(isDue);
  const results: { label: string; saved?: number; found?: number; error?: string }[] = [];

  for (const source of sources) {
    try {
      const url = new URL(source.url);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error("Only http/https URLs are supported.");
      }
      if (isPrivateHost(url.hostname.toLowerCase())) {
        throw new Error("Watched source URL points at a private/internal address.");
      }

      const res = await fetch(url.toString(), {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; SWKidsCyclingBot/1.0)" },
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) throw new Error(`Fetch failed: HTTP ${res.status}`);

      const text = htmlToText(await res.text()).slice(0, 60000);
      const candidates = await extractEvents({ text });
      const saved = await saveCandidates(supabase, candidates, source.label, source.url);

      await supabase
        .from("watched_sources")
        .update({
          last_checked_at: new Date().toISOString(),
          last_result_count: candidates.length,
          last_seen_events: { titles: candidates.map((c) => c.title) },
        })
        .eq("id", source.id);

      results.push({ label: source.label, saved, found: candidates.length });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unknown error";
      await supabase.from("watched_sources").update({ last_checked_at: new Date().toISOString() }).eq("id", source.id);
      results.push({ label: source.label, error: message });
    }
  }

  return NextResponse.json({ checked: results.length, skipped: (data?.length ?? 0) - sources.length, results });
}
