import type { Discipline, DisciplineId } from "./types";

export const EVENT_DISCIPLINES: Discipline[] = [
  { id: "cx", label: "Cyclocross", color: "#E0102A" },
  { id: "xc", label: "XC", color: "#1F5D3A" },
  { id: "road", label: "Road", color: "#1D3A6B" },
  { id: "tri", label: "Triathlon", color: "#0E7C86" },
  { id: "gravel", label: "Gravel", color: "#8B5E34" },
  { id: "duathlon", label: "Duathlon", color: "#A6446E" },
  { id: "clusters", label: "Cluster session", color: "#B8860B" },
  // Olive/yellow-green — hue ~82°, at least 39° from every neighbouring
  // colour above and below (clusters' gold at 43°, xc's green at 146°), so
  // it reads as its own colour rather than a near-miss of either.
  { id: "coaching", label: "Coaching session", color: "#5C7A29" },
  { id: "training", label: "Training", color: "#6B6B66" },
  { id: "other", label: "Other", color: "#6A3F86" },
];

// Muted grey, deliberately distinct from every colour in EVENT_DISCIPLINES /
// CLUB_DISCIPLINES below (including #6B6B66, already claimed by the real
// "training" entry) — see fallbackDiscipline for why this exists.
const FALLBACK_COLOR = "#9C9C94";

// Turns a raw enum value into a readable label: "future_discipline-xyz" ->
// "Future Discipline Xyz".
function humanize(id: string): string {
  return id
    .replace(/[-_]+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase()) || id;
}

// `discipline`/club-discipline columns are database enums that can gain a
// new value (via migration) before this deployment's code knows about it —
// that's exactly what took the site down: a `.find(...)!` on an id absent
// from the list returned undefined, and the caller's `.color` read threw,
// 500ing every page that renders an event. An unrecognised id must degrade
// to a neutral, labelled chip instead of crashing the page.
function fallbackDiscipline(id: string): Discipline {
  return { id: id as DisciplineId, label: humanize(id), color: FALLBACK_COLOR };
}

export const eventDisc = (id: DisciplineId): Discipline =>
  EVENT_DISCIPLINES.find((d) => d.id === id) ?? fallbackDiscipline(id);
export const ageLabel = (id: string) => id.toUpperCase();

export const CLUB_DISCIPLINES: Discipline[] = [
  { id: "road", label: "Road", color: "#1D3A6B" },
  { id: "xc", label: "XC / MTB", color: "#1F5D3A" },
  { id: "cx", label: "Cyclocross", color: "#E0102A" },
];

export const clubDisc = (id: string): Discipline =>
  CLUB_DISCIPLINES.find((d) => d.id === id) ?? fallbackDiscipline(id);
