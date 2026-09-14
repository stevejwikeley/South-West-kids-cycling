import { ukMidnightUtcIso } from "./uk-time.ts";
import type { EventSeriesFormValues } from "./actions/parse-series-form.ts";

// Pure row-builders for the four hand-written object literals in
// lib/actions/event-series.ts. Extracted so they can be unit-tested without
// a Supabase client or a bundler (this module loads under the project's
// plain-Node unit runner, hence the relative ".ts"-suffixed imports and the
// type-only import of EventSeriesFormValues, which is erased at runtime).
//
// Every field here must match what event-series.ts built inline before the
// extraction, byte for byte — this is a refactor, not a behaviour change.

export type SeriesFormValuesWithCoords = EventSeriesFormValues & { lat: number | null; lng: number | null };

// One events row per occurrence date, copying the series template. Matches
// the plain manual-create path in lib/actions/events.ts: auto-approved,
// source_type "manual".
export function occurrenceInsertRow(
  values: SeriesFormValuesWithCoords,
  seriesId: string,
  occurrenceDate: string,
  userId: string
) {
  return {
    title: values.title,
    discipline: values.discipline,
    status: values.status,
    kind: values.kind,
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
    club_id: values.club_id,
    description: values.description,
    region: values.region,
    source_type: "manual" as const,
    approved: true,
    series_id: seriesId,
    occurrence_date: occurrenceDate,
    series_detached: false,
    created_by: userId,
  };
}

// The event_series row created by createNewSeries.
export function seriesInsertRow(values: SeriesFormValuesWithCoords, userId: string) {
  return {
    title: values.title,
    discipline: values.discipline,
    status: values.status,
    kind: values.kind,
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
    club_id: values.club_id,
    description: values.description,
    region: values.region,
    approved: true,
    created_by: userId,
  };
}

// The event_series update in updateExistingSeries.
export function seriesUpdateRow(values: SeriesFormValuesWithCoords, userId: string) {
  return {
    title: values.title,
    discipline: values.discipline,
    status: values.status,
    kind: values.kind,
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
    club_id: values.club_id,
    description: values.description,
    region: values.region,
    updated_by: userId,
  };
}

// The propagating events update for still-attached future occurrences
// (toUpdateDates) in updateExistingSeries. Deliberately excludes
// start_datetime/occurrence_date/series_id/series_detached — those are
// per-occurrence identity, not part of the series template being pushed
// down.
export function eventsPropagateUpdateRow(values: SeriesFormValuesWithCoords, userId: string) {
  return {
    title: values.title,
    discipline: values.discipline,
    status: values.status,
    kind: values.kind,
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
    club_id: values.club_id,
    description: values.description,
    region: values.region,
    updated_by: userId,
  };
}
