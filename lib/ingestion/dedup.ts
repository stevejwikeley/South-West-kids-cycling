import type { EventRow } from "@/lib/supabase/types";
import type { ExtractedEvent } from "./extract-events";

// Shared dedup check used regardless of source — spec section 7.2: "runs
// through one shared dedup check (title + venue + date proximity against
// live events) before landing in the queue".
const DATE_PROXIMITY_DAYS = 3;

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
}

function titlesMatch(a: string, b: string): boolean {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

function venuesMatch(a: string | null, b: string): boolean {
  if (!a) return false;
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

function daysBetween(a: string, b: string): number {
  const diff = Math.abs(new Date(a).getTime() - new Date(b).getTime());
  return diff / (1000 * 60 * 60 * 24);
}

export function findDuplicate(candidate: ExtractedEvent, liveEvents: EventRow[]): EventRow | null {
  if (!candidate.date) return null;

  for (const event of liveEvents) {
    const eventDate = event.start_datetime.slice(0, 10);
    if (daysBetween(candidate.date, eventDate) > DATE_PROXIMITY_DAYS) continue;
    if (!titlesMatch(candidate.title, event.title)) continue;
    if (candidate.venue_name && !venuesMatch(candidate.venue_name, event.venue_name)) continue;
    return event;
  }

  return null;
}
