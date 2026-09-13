// Pure derivation for club training. Deliberately imports nothing — not even
// the `@/` alias — so `node --test --experimental-strip-types` can run
// lib/training.test.ts directly, with no bundler in the loop. The small
// isoWeekdayOf helper is duplicated from lib/recurrence.ts for that reason.

export interface TrainingSession {
  id: string;
  title: string;
  /** YYYY-MM-DD */
  date: string;
  venue: string;
  clubId: string;
}

const WEEKDAY_NAMES = [
  "Mondays",
  "Tuesdays",
  "Wednesdays",
  "Thursdays",
  "Fridays",
  "Saturdays",
  "Sundays",
];

// 1 = Monday .. 7 = Sunday, matching event_series.weekdays.
function isoWeekdayOf(date: string): number {
  const jsDay = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  return jsDay === 0 ? 7 : jsDay;
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// "Saturdays", or "Thursdays & Saturdays" — and null the moment the dates
// stop forming a weekly pattern. Returning null matters: the clubs page
// falls back to listing dates rather than asserting a rhythm that isn't
// there, which is the whole point of treating training as a hint.
export function weekdayPattern(sessions: TrainingSession[]): string | null {
  if (sessions.length === 0) return null;
  const days = new Set(sessions.map((s) => isoWeekdayOf(s.date)));
  if (days.size > 2) return null;
  return [...days]
    .sort((a, b) => a - b)
    .map((d) => WEEKDAY_NAMES[d - 1])
    .join(" & ");
}

// Distinct dates from a session list, in ascending order. Used when multiple
// sessions on the same day (e.g. a Saturday road ride and a Saturday Junior
// Academy) must not appear twice in a summary. No filtering by date; caller
// is responsible for pre-filtering if needed.
export function distinctDates(sessions: TrainingSession[]): string[] {
  const dates = [...new Set(sessions.map((s) => s.date))];
  dates.sort((a, b) => a.localeCompare(b));
  return dates;
}

// Up to `n` distinct upcoming dates, ascending — two sessions on the same
// day (e.g. a Saturday road ride and a Saturday Junior Academy) must not
// make that date appear twice in a "when do they train" summary.
export function nextDistinctDates(sessions: TrainingSession[], today: string, n: number): string[] {
  const dates = [...new Set(sessions.filter((s) => s.date >= today).map((s) => s.date))];
  dates.sort((a, b) => a.localeCompare(b));
  return dates.slice(0, n);
}

// The venue only when every upcoming session shares it — never one picked
// from an arbitrary session. A club training at two different sites has no
// single answer to "where", and guessing (e.g. from the next session alone)
// can send a parent to the wrong address.
export function commonVenue(sessions: TrainingSession[]): string | null {
  if (sessions.length === 0) return null;
  const venues = new Set(sessions.map((s) => s.venue));
  return venues.size === 1 ? sessions[0].venue : null;
}

export function groupByClub(sessions: TrainingSession[]): Map<string, TrainingSession[]> {
  const grouped = new Map<string, TrainingSession[]>();
  for (const s of sessions) {
    const existing = grouped.get(s.clubId);
    if (existing) existing.push(s);
    else grouped.set(s.clubId, [s]);
  }
  for (const list of grouped.values()) list.sort((a, b) => a.date.localeCompare(b.date));
  return grouped;
}

// `days` counts today as day one, so days = 7 ends six days from now.
export function sessionsInNextDays(
  sessions: TrainingSession[],
  today: string,
  days: number
): TrainingSession[] {
  const last = addDays(today, days - 1);
  return sessions
    .filter((s) => s.date >= today && s.date <= last)
    .sort((a, b) => a.date.localeCompare(b.date));
}
