import type { ClubDiscipline, ClubRow } from "@/lib/supabase/types";

export type ClubFormValues = Pick<
  ClubRow,
  "name" | "location" | "website" | "disciplines" | "age_note" | "kids_only" | "founded" | "summary"
>;

export function parseClubForm(formData: FormData): { ok: false; error: string } | { ok: true; values: ClubFormValues } {
  const name = String(formData.get("name") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim();
  const website = String(formData.get("website") ?? "").trim() || null;
  const disciplines = formData.getAll("disciplines").map(String) as ClubDiscipline[];
  const ageNote = String(formData.get("age_note") ?? "").trim() || null;
  const kidsOnly = formData.get("kids_only") === "on";
  const founded = String(formData.get("founded") ?? "").trim() || null;
  const summary = String(formData.get("summary") ?? "").trim() || null;

  if (!name) return { ok: false, error: "Name is required." };
  if (!location) return { ok: false, error: "Location is required." };
  if (disciplines.length === 0) return { ok: false, error: "Pick at least one discipline." };

  return {
    ok: true,
    values: {
      name,
      location,
      website,
      disciplines,
      age_note: ageNote,
      kids_only: kidsOnly,
      founded,
      summary,
    },
  };
}
