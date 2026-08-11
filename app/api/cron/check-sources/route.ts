import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkWatchedSource } from "@/lib/ingestion/check-source";
import type { WatchedSourceRow } from "@/lib/supabase/types";

// Sequential, not parallel: each source costs one Claude extraction call, and
// this all has to fit inside one invocation's time budget. Fine for a
// handful of sources; revisit (fan out to per-source invocations) if the
// watched list grows large enough to threaten maxDuration.
export const maxDuration = 60;

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
  const results: { label: string; result: Awaited<ReturnType<typeof checkWatchedSource>> }[] = [];

  for (const source of sources) {
    const result = await checkWatchedSource(supabase, source);
    results.push({ label: source.label, result });
  }

  return NextResponse.json({ checked: results.length, skipped: (data?.length ?? 0) - sources.length, results });
}
