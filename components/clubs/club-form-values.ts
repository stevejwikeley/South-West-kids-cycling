import type { Club, ClubDisciplineId } from "@/lib/types";

export interface ClubFieldValues {
  name: string;
  location: string;
  website: string;
  disciplines: ClubDisciplineId[];
  ageNote: string;
  kidsOnly: boolean;
  founded: string;
  summary: string;
}

export function clubToValues(club?: Club): ClubFieldValues {
  return {
    name: club?.name ?? "",
    location: club?.location ?? "",
    website: club?.website ?? "",
    disciplines: club?.disciplines ?? [],
    ageNote: club?.ageNote ?? "",
    kidsOnly: club?.kidsOnly ?? false,
    founded: club?.founded ?? "",
    summary: club?.summary ?? "",
  };
}

// Only needed by ClubQuickAdd, which calls createClub() directly rather
// than submitting a real <form> — ClubForm's fields serialize themselves
// via native form submission instead.
export function clubValuesToFormData(values: ClubFieldValues): FormData {
  const formData = new FormData();
  formData.set("name", values.name);
  formData.set("location", values.location);
  formData.set("website", values.website);
  values.disciplines.forEach((d) => formData.append("disciplines", d));
  formData.set("age_note", values.ageNote);
  if (values.kidsOnly) formData.set("kids_only", "on");
  formData.set("founded", values.founded);
  formData.set("summary", values.summary);
  return formData;
}
