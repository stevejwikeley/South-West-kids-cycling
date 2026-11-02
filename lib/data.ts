import { createClient } from "@/lib/supabase/server";
import { ukDateOf } from "@/lib/uk-time";
import { httpUrlOrNull } from "@/lib/safe-url";
import { PUBLIC_EVENT_SELECT, type PublicEventRow } from "@/lib/supabase/columns";
import type { CalendarEvent, Club } from "@/lib/types";
import type { EventRow, ClubRow, EventPendingRow } from "@/lib/supabase/types";

function toCalendarEvent(row: PublicEventRow): CalendarEvent {
  return {
    id: row.id,
    title: row.title,
    discipline: row.discipline,
    date: ukDateOf(row.start_datetime),
    venue: row.venue_name,
    region: row.region,
    status: row.status,
    kidsOnly: row.kids_only,
    ages: row.age_categories,
    bookingStatus: row.booking_status,
    // Re-checked on the way out too: rows written before URL validation
    // existed (or straight into the database) never reach an href unchecked.
    booking: httpUrlOrNull(row.booking_link),
    organiserUrl: httpUrlOrNull(row.organiser_url),
  };
}

function toClub(row: ClubRow): Club {
  return {
    id: row.id,
    name: row.name,
    location: row.location,
    website: httpUrlOrNull(row.website),
    disciplines: row.disciplines,
    ageNote: row.age_note,
    kidsOnly: row.kids_only,
    founded: row.founded,
    summary: row.summary,
  };
}

export async function getEvents(): Promise<CalendarEvent[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("events")
    .select(PUBLIC_EVENT_SELECT)
    // Explicit, not left to RLS: a signed-in admin/organiser can read
    // unapproved rows, and they must never leak onto the public calendar.
    .eq("approved", true)
    .order("start_datetime", { ascending: true });

  if (error) throw error;
  return (data as unknown as PublicEventRow[]).map(toCalendarEvent);
}

export async function getClubs(): Promise<Club[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("clubs").select("*").order("name");

  if (error) throw error;
  return (data as ClubRow[]).map(toClub);
}

// Used by the public suggest-a-change page as well as the edit pages, so it
// sticks to the columns anon can read.
export async function getEventRowById(id: string): Promise<PublicEventRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("events").select(PUBLIC_EVENT_SELECT).eq("id", id).single();

  if (error) return null;
  return data as unknown as PublicEventRow;
}

export async function getMyEventRows(userId: string): Promise<EventRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("created_by", userId)
    .order("start_datetime", { ascending: true });

  if (error) throw error;
  return data as EventRow[];
}

export async function getAllEventRows(): Promise<EventRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .order("start_datetime", { ascending: true });

  if (error) throw error;
  return data as EventRow[];
}

export async function getPendingChangeRows(): Promise<EventPendingRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("events_pending")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data as EventPendingRow[];
}
