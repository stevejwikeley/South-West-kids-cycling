import type { AgeCategory } from "@/lib/supabase/types";

export interface BookingPersonInput {
  name: string;
  ageCategory: AgeCategory;
}

export interface BookingFormValues {
  contactName: string;
  email: string;
  phone: string | null;
  people: BookingPersonInput[];
}

// Person rows share input names ("person_name"/"person_age") across every
// row rather than indexed names — same pattern as the "ages" checkboxes in
// parse-event-form.ts — so formData.getAll() returns parallel arrays in
// DOM order regardless of how many rows the client added/removed.
export function parseBookingForm(
  formData: FormData
): { ok: false; error: string } | { ok: true; values: BookingFormValues } {
  const contactName = String(formData.get("contact_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const names = formData.getAll("person_name").map((v) => String(v).trim());
  const ageCategories = formData.getAll("person_age").map((v) => String(v) as AgeCategory);

  if (!contactName) return { ok: false, error: "Your name is required." };
  if (!email) return { ok: false, error: "Email is required." };
  if (names.length === 0) return { ok: false, error: "Add at least one person." };
  if (names.length !== ageCategories.length) return { ok: false, error: "Every person needs an age category." };

  const people = names.map((name, i) => ({ name, ageCategory: ageCategories[i] }));
  if (people.some((p) => !p.name)) return { ok: false, error: "Every person needs a name." };
  if (people.some((p) => !p.ageCategory)) return { ok: false, error: "Every person needs an age category." };

  return { ok: true, values: { contactName, email, phone, people } };
}
