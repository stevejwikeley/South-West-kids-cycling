"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { parseSeriesForm, type EventSeriesFormValues } from "./parse-series-form";
import { geocodeLocation } from "@/lib/geocode";
import { generateOccurrenceDates } from "@/lib/recurrence";
import { ukMidnightUtcIso } from "@/lib/uk-time";
import type { EventSeriesExceptionRow, EventRow } from "@/lib/supabase/types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export interface SeriesFormState {
  error?: string;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// One events row per occurrence date, copying the series template. Matches
// the plain manual-create path in lib/actions/events.ts: auto-approved,
// source_type "manual".
function occurrenceInsertRow(
  values: EventSeriesFormValues & { lat: number | null; lng: number | null },
  seriesId: string,
  occurrenceDate: string,
  userId: string
) {
  return {
    title: values.title,
    discipline: values.discipline,
    status: values.status,
    all_day: true,
    start_datetime: ukMidnightUtcIso(occurrenceDate),
    end_datetime: null,
    venue_name: values.venue_name,
    address: values.address,
    postcode: values.postcode,
    lat: values.lat,
    lng: values.lng,
    age_categories: values.age_categories,
    kids_only: values.kids_only,
    booking_status: values.booking_status,
    booking_link: values.booking_link,
    organiser_url: values.organiser_url,
    organiser_name: values.organiser_name,
    organiser_contact: values.organiser_contact,
    region: values.region,
    source_type: "manual" as const,
    approved: true,
    series_id: seriesId,
    occurrence_date: occurrenceDate,
    series_detached: false,
    created_by: userId,
  };
}

// redirectTo is null for a possible future inline panel; every current
// caller (the series create/edit pages) passes a real path.
export async function saveSeries(
  redirectTo: string | null,
  _prevState: SeriesFormState,
  formData: FormData
): Promise<SeriesFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const parsed = parseSeriesForm(formData);
  if (!parsed.ok) return { error: parsed.error };

  // Same postcode -> lat/lng handling as saveEvent: no postcode clears the
  // pin, postcode present but the lookup failing leaves lat/lng untouched.
  const coords = await geocodeLocation({ postcode: parsed.values.postcode });
  const values = parsed.values.postcode
    ? coords
      ? { ...parsed.values, lat: coords.lat, lng: coords.lng }
      : { ...parsed.values, lat: null, lng: null }
    : { ...parsed.values, lat: null, lng: null };

  const seriesId = String(formData.get("id") ?? "").trim() || null;
  const fromEventId = String(formData.get("from_event_id") ?? "").trim() || null;

  const result = seriesId
    ? await updateExistingSeries(supabase, user.id, seriesId, values)
    : await createNewSeries(supabase, user.id, values, fromEventId);

  if (result.error) return result;
  if (redirectTo) redirect(redirectTo);
  return {};
}

async function createNewSeries(
  supabase: SupabaseServerClient,
  userId: string,
  values: EventSeriesFormValues & { lat: number | null; lng: number | null },
  fromEventId: string | null
): Promise<SeriesFormState> {
  const occurrences = generateOccurrenceDates({
    startDate: values.start_date,
    untilDate: values.until_date,
    weekdays: values.weekdays,
  });
  if (!occurrences.ok) return { error: occurrences.error };
  if (occurrences.dates.length === 0) {
    return { error: "That pattern produces no dates in the given range — check the weekdays and end date." };
  }

  const { data: series, error: seriesError } = await supabase
    .from("event_series")
    .insert({
      title: values.title,
      discipline: values.discipline,
      status: values.status,
      weekdays: values.weekdays,
      start_date: values.start_date,
      until_date: values.until_date,
      venue_name: values.venue_name,
      address: values.address,
      postcode: values.postcode,
      lat: values.lat,
      lng: values.lng,
      age_categories: values.age_categories,
      kids_only: values.kids_only,
      booking_status: values.booking_status,
      booking_link: values.booking_link,
      organiser_url: values.organiser_url,
      organiser_name: values.organiser_name,
      organiser_contact: values.organiser_contact,
      region: values.region,
      approved: true,
      created_by: userId,
    })
    .select("id")
    .single();
  if (seriesError || !series) return { error: seriesError?.message ?? "Could not create the series." };

  const rows = occurrences.dates.map((date) => occurrenceInsertRow(values, series.id, date, userId));
  const { error: occurrencesError } = await supabase.from("events").insert(rows);
  if (occurrencesError) {
    // No cross-table transaction via supabase-js — clean up the orphaned
    // series row rather than leaving a series with zero occurrences behind.
    await supabase.from("event_series").delete().eq("id", series.id);
    return { error: occurrencesError.message };
  }

  // "Convert to recurring event" (EventForm's link on a plain event) passes
  // the original one-off event's id here — replace it with the new series
  // now that its occurrences exist, best-effort: the series is already
  // created successfully at this point, so a failure here isn't reported as
  // a failure of the save itself.
  if (fromEventId) {
    await supabase.from("events").delete().eq("id", fromEventId);
  }

  return {};
}

async function updateExistingSeries(
  supabase: SupabaseServerClient,
  userId: string,
  seriesId: string,
  values: EventSeriesFormValues & { lat: number | null; lng: number | null }
): Promise<SeriesFormState> {
  const { data: exceptionRows, error: exceptionsError } = await supabase
    .from("event_series_exceptions")
    .select("occurrence_date")
    .eq("series_id", seriesId);
  if (exceptionsError) return { error: exceptionsError.message };
  const exceptionDates = (exceptionRows as Pick<EventSeriesExceptionRow, "occurrence_date">[]).map(
    (r) => r.occurrence_date
  );

  const occurrences = generateOccurrenceDates({
    startDate: values.start_date,
    untilDate: values.until_date,
    weekdays: values.weekdays,
    excludeDates: exceptionDates,
  });
  if (!occurrences.ok) return { error: occurrences.error };

  const { error: updateSeriesError } = await supabase
    .from("event_series")
    .update({
      title: values.title,
      discipline: values.discipline,
      status: values.status,
      weekdays: values.weekdays,
      start_date: values.start_date,
      until_date: values.until_date,
      venue_name: values.venue_name,
      address: values.address,
      postcode: values.postcode,
      lat: values.lat,
      lng: values.lng,
      age_categories: values.age_categories,
      kids_only: values.kids_only,
      booking_status: values.booking_status,
      booking_link: values.booking_link,
      organiser_url: values.organiser_url,
      organiser_name: values.organiser_name,
      organiser_contact: values.organiser_contact,
      region: values.region,
      updated_by: userId,
    })
    .eq("id", seriesId);
  if (updateSeriesError) return { error: updateSeriesError.message };

  // Never touch anything before today — only propagate into the future.
  const today = todayIso();
  const desiredFutureDates = new Set(occurrences.dates.filter((d) => d >= today));

  const { data: futureRows, error: futureRowsError } = await supabase
    .from("events")
    .select("id, occurrence_date, series_detached")
    .eq("series_id", seriesId)
    .gte("occurrence_date", today);
  if (futureRowsError) return { error: futureRowsError.message };

  const rows = futureRows as Pick<EventRow, "id" | "occurrence_date" | "series_detached">[];
  const attached = rows.filter((r) => !r.series_detached);
  const detached = rows.filter((r) => r.series_detached);
  const attachedDates = new Set(attached.map((r) => r.occurrence_date!));
  const occupiedDates = new Set([...attachedDates, ...detached.map((r) => r.occurrence_date!)]);

  const toUpdateDates = [...attachedDates].filter((d) => desiredFutureDates.has(d));
  const toDeleteDates = [...attachedDates].filter((d) => !desiredFutureDates.has(d));
  const toInsertDates = [...desiredFutureDates].filter((d) => !occupiedDates.has(d));

  if (toUpdateDates.length > 0) {
    const { error } = await supabase
      .from("events")
      .update({
        title: values.title,
        discipline: values.discipline,
        status: values.status,
        venue_name: values.venue_name,
        address: values.address,
        postcode: values.postcode,
        lat: values.lat,
        lng: values.lng,
        age_categories: values.age_categories,
        kids_only: values.kids_only,
        booking_status: values.booking_status,
        booking_link: values.booking_link,
        organiser_url: values.organiser_url,
        organiser_name: values.organiser_name,
        organiser_contact: values.organiser_contact,
        region: values.region,
        updated_by: userId,
      })
      .eq("series_id", seriesId)
      .eq("series_detached", false)
      .in("occurrence_date", toUpdateDates);
    if (error) return { error: error.message };
  }

  if (toDeleteDates.length > 0) {
    // Not recorded as an exception — a structural consequence of the
    // pattern change (weekday removed / until_date shortened), so if the
    // pattern is edited back these dates should legitimately regenerate.
    const { error } = await supabase
      .from("events")
      .delete()
      .eq("series_id", seriesId)
      .eq("series_detached", false)
      .in("occurrence_date", toDeleteDates);
    if (error) return { error: error.message };
  }

  if (toInsertDates.length > 0) {
    const newRows = toInsertDates.map((date) => occurrenceInsertRow(values, seriesId, date, userId));
    const { error } = await supabase.from("events").insert(newRows);
    if (error) return { error: error.message };
  }

  return {};
}

export interface DeleteSeriesResult {
  error?: string;
}

export async function deleteSeries(id: string): Promise<DeleteSeriesResult> {
  const supabase = await createClient();

  // Detached occurrences must survive as standalone events, so delete only
  // the still-linked ones explicitly before removing the series row — the
  // FK's `on delete set null` then just clears series_id on the detached
  // rows left behind, as a safety net.
  const { error: eventsError } = await supabase
    .from("events")
    .delete()
    .eq("series_id", id)
    .eq("series_detached", false);
  if (eventsError) return { error: eventsError.message };

  const { error: seriesError } = await supabase.from("event_series").delete().eq("id", id);
  if (seriesError) return { error: seriesError.message };

  return {};
}

export interface SkipOccurrencesResult {
  error?: string;
}

// Handles both "skip one date" (fromDate === toDate) and "skip a range" —
// only dates that actually match the series' weekday pattern become
// exceptions. Skipping overrides any prior per-occurrence customization: the
// events row for a matching date is removed regardless of series_detached.
export async function skipSeriesOccurrences(
  seriesId: string,
  fromDate: string,
  toDate: string
): Promise<SkipOccurrencesResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { data: series, error: seriesError } = await supabase
    .from("event_series")
    .select("weekdays")
    .eq("id", seriesId)
    .single();
  if (seriesError || !series) return { error: seriesError?.message ?? "Series not found." };

  const matching = generateOccurrenceDates({
    startDate: fromDate,
    untilDate: toDate,
    weekdays: series.weekdays,
  });
  if (!matching.ok) return { error: matching.error };
  if (matching.dates.length === 0) return {};

  const { error: exceptionError } = await supabase
    .from("event_series_exceptions")
    .upsert(
      matching.dates.map((occurrence_date) => ({ series_id: seriesId, occurrence_date, created_by: user.id })),
      { onConflict: "series_id,occurrence_date", ignoreDuplicates: true }
    );
  if (exceptionError) return { error: exceptionError.message };

  const { error: deleteError } = await supabase
    .from("events")
    .delete()
    .eq("series_id", seriesId)
    .in("occurrence_date", matching.dates);
  if (deleteError) return { error: deleteError.message };

  return {};
}
