"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { parseEventForm } from "./parse-event-form";

export interface EventFormState {
  error?: string;
}

export async function saveEvent(
  redirectTo: string,
  _prevState: EventFormState,
  formData: FormData
): Promise<EventFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const parsed = parseEventForm(formData);
  if (!parsed.ok) return { error: parsed.error };

  const id = String(formData.get("id") ?? "").trim() || null;

  if (id) {
    const { error } = await supabase
      .from("events")
      .update({ ...parsed.values, updated_by: user.id })
      .eq("id", id);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase
      .from("events")
      .insert({ ...parsed.values, created_by: user.id, approved: true, source_type: "manual" });
    if (error) return { error: error.message };
  }

  redirect(redirectTo);
}

export async function deleteEvent(id: string, redirectTo: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("events").delete().eq("id", id);
  if (error) throw new Error(error.message);
  redirect(redirectTo);
}
