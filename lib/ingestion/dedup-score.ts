// Pure scoring half of findDuplicate() (dedup.ts) — no server/LLM imports, so
// it can be unit-tested directly (lib/dedup-score.test.ts).
//
// Four signals decide whether a candidate is an event we already have:
// name, organiser, venue and date. None of them is trusted on its own,
// because each one legitimately drifts:
//   - names get reworded between scans (season year dropped, organiser
//     prefixed, clauses reordered);
//   - organisers get written differently ("South West Cyclo-Cross League"
//     vs "South West Cyclocross League (hosted by Dartmoor Velo)");
//   - venues move (a round relocated to a backup field);
//   - dates move (a race postponed a fortnight).
// So a match needs the name plus at least as much agreement as disagreement
// from organiser/venue, and a date that moved further than a few days only
// ever goes to the LLM for a judgement call — never auto-matched.

export interface DedupFields {
  title: string;
  date: string | null; // YYYY-MM-DD
  venue_name: string | null;
  postcode: string | null;
  organiser_name: string | null;
  club_id: string | null;
  kind: string | null;
}

export type MatchVerdict = "match" | "maybe" | "reschedule" | "no";

export interface MatchAssessment {
  verdict: MatchVerdict;
  // For ranking the LLM shortlist — higher is a closer match.
  score: number;
}

export const DATE_PROXIMITY_DAYS = 3;
// How far a date can move and still be considered "the same event,
// rescheduled". Beyond this it's next season's edition, not a postponement.
export const RESCHEDULE_WINDOW_DAYS = 60;
const CONFIDENT_NAME = 0.55;
const STRONG_NAME = 0.7;
const AMBIGUOUS_NAME = 0.25;
const ORGANISER_OVERLAP = 0.6;

// Words that say nothing about which organiser it is — "Exeter CC" and
// "Bristol CC" must not match on "cc".
const ORGANISER_STOPWORDS = new Set([
  "the", "and", "of", "by", "cc", "rc", "club", "cycling", "cycle", "cycles", "bike", "bikes",
  "team", "racing", "hosted", "in", "association", "with",
]);
const NAME_STOPWORDS = new Set(["the", "and", "of", "at", "in", "a", "for", "with"]);

function normalize(s: string): string {
  return s
    .toLowerCase()
    // Season qualifiers ("2026/27", "2026-2027", "2026") come and go
    // between scans of the very same listing.
    .replace(/\b20\d\d\s*[/-]\s*\d{2,4}\b/g, " ")
    .replace(/\b20\d\d\b/g, " ")
    // Join hyphenated/apostrophe'd words so "Cyclo-Cross" == "Cyclocross"
    // and "Woody's" == "Woodys". Spaced dashes are separators and stay so.
    .replace(/([a-z0-9])[-'’]([a-z0-9])/g, "$1$2")
    .replace(/[^a-z0-9 ]/g, " ")
    .trim();
}

function tokens(s: string | null, stopwords: Set<string>): Set<string> {
  if (!s) return new Set();
  return new Set(normalize(s).split(/\s+/).filter((t) => t && !stopwords.has(t)));
}

function dice(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  return (2 * shared) / (a.size + b.size);
}

// Shared tokens over the smaller set — "Newnham Bottom" is fully contained
// in "Newnham Bottom Field", which Dice would undersell.
function overlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  return shared / Math.min(a.size, b.size);
}

// Titles often carry the organiser's name ("Wheal Velocity Indoor Session"
// vs "Indoor Session"), which would otherwise drag the score down. Strip
// both sides' organiser words — unless that would leave a title empty.
export function nameSimilarity(a: DedupFields, b: DedupFields): number {
  const orgWords = new Set([
    ...tokens(a.organiser_name, ORGANISER_STOPWORDS),
    ...tokens(b.organiser_name, ORGANISER_STOPWORDS),
  ]);
  const strip = (t: Set<string>) => {
    const kept = new Set([...t].filter((w) => !orgWords.has(w)));
    return kept.size > 0 ? kept : t;
  };
  return dice(strip(tokens(a.title, NAME_STOPWORDS)), strip(tokens(b.title, NAME_STOPWORDS)));
}

// true = same organiser, false = clearly different, null = can't tell.
export function organiserSignal(a: DedupFields, b: DedupFields): boolean | null {
  if (a.club_id && b.club_id) return a.club_id === b.club_id;
  const ta = tokens(a.organiser_name, ORGANISER_STOPWORDS);
  const tb = tokens(b.organiser_name, ORGANISER_STOPWORDS);
  if (ta.size === 0 || tb.size === 0) return null;
  return overlap(ta, tb) >= ORGANISER_OVERLAP;
}

function compactPostcode(p: string | null): string | null {
  const c = p?.toUpperCase().replace(/\s+/g, "");
  return c ? c : null;
}

// true = same place, false = clearly different place, null = can't tell.
export function venueSignal(a: DedupFields, b: DedupFields): boolean | null {
  const pa = compactPostcode(a.postcode);
  const pb = compactPostcode(b.postcode);
  if (pa && pb && pa === pb) return true;

  const va = tokens(a.venue_name, NAME_STOPWORDS);
  const vb = tokens(b.venue_name, NAME_STOPWORDS);
  if (va.size > 0 && vb.size > 0) {
    return dice(va, vb) >= CONFIDENT_NAME || overlap(va, vb) >= 0.8;
  }
  if (pa && pb) return false;
  return null;
}

// Two entries in the same numbered series ("Round 1" vs "Round 2") share
// almost every other word, so differing round numbers always mean
// different events.
export function roundNumbersConflict(a: string, b: string): boolean {
  const ra = a.match(/round\s*(\d+)/i)?.[1];
  const rb = b.match(/round\s*(\d+)/i)?.[1];
  return !!ra && !!rb && ra !== rb;
}

function dayGap(a: string, b: string): number {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / (1000 * 60 * 60 * 24);
}

export function assessMatch(candidate: DedupFields, event: DedupFields): MatchAssessment {
  if (roundNumbersConflict(candidate.title, event.title)) return { verdict: "no", score: 0 };

  const name = nameSimilarity(candidate, event);
  const org = organiserSignal(candidate, event);
  const venue = venueSignal(candidate, event);
  const agree = Number(org === true) + Number(venue === true);
  const disagree = Number(org === false) + Number(venue === false);
  const score = name + 0.25 * agree - 0.25 * disagree;

  // Undated listings (weekly sessions with no specific date) can only
  // match other undated listings — name and organiser are all there is.
  if (!candidate.date || !event.date) {
    if (candidate.date || event.date) return { verdict: "no", score };
    if (name >= CONFIDENT_NAME && org !== false) return { verdict: "match", score };
    return { verdict: name >= AMBIGUOUS_NAME && org === true ? "maybe" : "no", score };
  }

  const gap = dayGap(candidate.date, event.date);

  if (gap <= DATE_PROXIMITY_DAYS) {
    // A venue change with the organiser agreeing (or vice versa) still
    // counts — it only takes one corroborating signal per contradicting one.
    if (name >= CONFIDENT_NAME && agree >= disagree) return { verdict: "match", score };
    if (name >= AMBIGUOUS_NAME) return { verdict: "maybe", score };
    // Same organiser, same place, same day, but renamed beyond recognition.
    if (gap === 0 && org === true && venue === true) return { verdict: "maybe", score };
    return { verdict: "no", score };
  }

  // Date moved further than a few days: possibly a postponement. Weekly
  // club training repeats with an identical name every week, so a
  // different date there is a different session, never a reschedule.
  if (
    gap <= RESCHEDULE_WINDOW_DAYS &&
    candidate.kind !== "training" &&
    event.kind !== "training" &&
    name >= STRONG_NAME &&
    disagree === 0 &&
    agree >= 1
  ) {
    return { verdict: "reschedule", score };
  }

  return { verdict: "no", score };
}
