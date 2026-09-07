// Pure date-generation logic for weekly recurring series — no Supabase
// dependency, so this is easy to unit test in isolation from the DB.

// Bounds a fat-fingered `until_date` decades out (roughly 5 years of a
// single weekly weekday). A series that would exceed this must be rejected
// outright, never silently truncated.
export const MAX_SERIES_OCCURRENCES = 260;

// JS Date#getUTCDay() returns 0(Sun)..6(Sat); this converts to the ISO
// weekday numbering used throughout event_series: 1(Mon)..7(Sun).
export function isoWeekday(dateStr: string): number {
  const jsDay = new Date(`${dateStr}T00:00:00.000Z`).getUTCDay();
  return jsDay === 0 ? 7 : jsDay;
}

export interface GenerateOccurrenceDatesArgs {
  startDate: string;
  untilDate: string;
  weekdays: number[];
  excludeDates?: Iterable<string>;
}

export type GenerateOccurrenceDatesResult =
  | { ok: true; dates: string[] }
  | { ok: false; error: string };

// startDate is a floor, not a required match — the first generated date is
// the earliest date on/after startDate whose weekday is in `weekdays`, same
// UX as Google Calendar (pick any start date, the pattern finds the first
// real occurrence).
export function generateOccurrenceDates({
  startDate,
  untilDate,
  weekdays,
  excludeDates,
}: GenerateOccurrenceDatesArgs): GenerateOccurrenceDatesResult {
  const weekdaySet = new Set(weekdays);
  const excludeSet = new Set(excludeDates ?? []);
  const dates: string[] = [];

  const cursor = new Date(`${startDate}T00:00:00.000Z`);
  const until = new Date(`${untilDate}T00:00:00.000Z`);

  while (cursor.getTime() <= until.getTime()) {
    const dateStr = cursor.toISOString().slice(0, 10);
    const jsDay = cursor.getUTCDay();
    const iso = jsDay === 0 ? 7 : jsDay;
    if (weekdaySet.has(iso) && !excludeSet.has(dateStr)) {
      if (dates.length >= MAX_SERIES_OCCURRENCES) {
        return {
          ok: false,
          error: `Too many occurrences (max ${MAX_SERIES_OCCURRENCES}) — shorten the end date or select fewer weekdays.`,
        };
      }
      dates.push(dateStr);
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return { ok: true, dates };
}
