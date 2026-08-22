"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { parseEventForm } from "./parse-event-form";
import { getCurrentProfile, isAdminRole } from "@/lib/auth";
import { getEventRowById } from "@/lib/data";
import { geocodeLocation } from "@/lib/geocode";
import type { EventRow } from "@/lib/supabase/types";

export interface EventFormState {
  error?: string;
  success?: boolean;
}

// redirectTo is null for the calendar page's inline edit panel, which stays
// on the same page and closes itself via onSuccess rather than navigating.
export async function saveEvent(
  redirectTo: string | null,
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

  // Postcode absent -> explicitly clear lat/lng (an edit that removed the
  // postcode shouldn't leave a stale, now-unverifiable pin behind). Postcode
  // present but the lookup itself failed (a transient network issue) ->
  // leave lat/lng untouched rather than wiping a known-good pin over a blip.
  const coords = await geocodeLocation({ postcode: parsed.values.postcode });
  const values = parsed.values.postcode
    ? coords
      ? { ...parsed.values, lat: coords.lat, lng: coords.lng }
      : parsed.values
    : { ...parsed.values, lat: null, lng: null };

  if (id) {
    const { error } = await supabase
      .from("events")
      .update({ ...values, updated_by: user.id })
      .eq("id", id);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase
      .from("events")
      .insert({ ...values, created_by: user.id, approved: true, source_type: "manual" });
    if (error) return { error: error.message };
  }

  if (redirectTo) redirect(redirectTo);
  return { success: true };
}

// Used by the calendar page's inline edit panel, which only has the
// display-oriented CalendarEvent shape and needs the full EventRow to
// populate EventForm.
export async function getEventForEdit(id: string): Promise<EventRow | null> {
  const profile = await getCurrentProfile();
  if (!isAdminRole(profile)) return null;
  return getEventRowById(id);
}

export interface VerifyEventResult {
  error?: string;
}

// Clears field_flags entirely — an admin reviewing the event is vouching for
// all of it, not field-by-field, so there's no partial-clear here.
export async function verifyEventFields(id: string): Promise<VerifyEventResult> {
  const profile = await getCurrentProfile();
  if (!isAdminRole(profile)) return { error: "Not authorised." };

  const supabase = await createClient();
  const { error } = await supabase.from("events").update({ field_flags: null }).eq("id", id);
  if (error) return { error: error.message };
  return {};
}

export interface DeleteEventResult {
  error?: string;
}

// Returns { error } rather than throwing, and doesn't redirect server-side —
// a thrown error from a directly-invoked (non-<form>) server action surfaces
// as a raw failed POST, and the caller navigates itself so it isn't at the
// mercy of the client router cache serving a stale list after redirect().
export async function deleteEvent(id: string): Promise<DeleteEventResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("events").delete().eq("id", id);
  if (error) return { error: error.message };
  return {};
}
