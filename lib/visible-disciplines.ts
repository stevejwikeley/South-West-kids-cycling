import { EVENT_DISCIPLINES, eventDisc } from "./mock-data.ts";
import type { Discipline, DisciplineId } from "./types.ts";

// Pulled out of CalendarPage.tsx's useMemo so the fix for I1 (a discipline
// genuinely present in the data must always get a filter chip, even one
// this deployment's EVENT_DISCIPLINES list doesn't know about yet) can be
// unit-tested directly, without a DOM/React test setup this project doesn't
// have. Curated ordering still applies to known disciplines; anything
// unrecognised — using eventDisc's fallback for its label/colour — is
// appended after them so it's still filterable rather than invisible.
export function visibleDisciplinesFor(disciplineIds: DisciplineId[]): Discipline[] {
  const present = [...new Set(disciplineIds)];
  const known = EVENT_DISCIPLINES.filter((d) => present.includes(d.id));
  const unknown = present.filter((id) => !EVENT_DISCIPLINES.some((d) => d.id === id)).map(eventDisc);
  return [...known, ...unknown];
}
