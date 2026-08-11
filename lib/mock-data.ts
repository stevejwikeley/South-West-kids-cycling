import type { Discipline, DisciplineId } from "./types";

export const EVENT_DISCIPLINES: Discipline[] = [
  { id: "cx", label: "Cyclocross", color: "#E0102A" },
  { id: "xc", label: "XC", color: "#1F5D3A" },
  { id: "road", label: "Road", color: "#1D3A6B" },
  { id: "tri", label: "Triathlon", color: "#0E7C86" },
  { id: "gravel", label: "Gravel", color: "#8B5E34" },
  { id: "duathlon", label: "Duathlon", color: "#A6446E" },
  { id: "clusters", label: "Club Clusters", color: "#6B6B66" },
  { id: "other", label: "Other", color: "#6A3F86" },
];

export const eventDisc = (id: DisciplineId) => EVENT_DISCIPLINES.find((d) => d.id === id)!;
export const ageLabel = (id: string) => id.toUpperCase();

export const CLUB_DISCIPLINES: Discipline[] = [
  { id: "road", label: "Road", color: "#1D3A6B" },
  { id: "xc", label: "XC / MTB", color: "#1F5D3A" },
  { id: "cx", label: "Cyclocross", color: "#E0102A" },
];

export const clubDisc = (id: string) => CLUB_DISCIPLINES.find((d) => d.id === id)!;
