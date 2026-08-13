import { createClient } from "@/lib/supabase/server";
import type { CalendarEvent, Club } from "@/lib/types";
import type { EventRow, ClubRow, EventPendingRow, WatchedSourceRow, ProfileRow } from "@/lib/supabase/types";

function toCalendarEvent(row: EventRow): CalendarEvent {
  return {
    id: row.id,
    title: row.title,
    discipline: row.discipline,
    date: row.start_datetime.slice(0, 10),
    venue: row.venue_name,
    address: row.address,
    postcode: row.postcode,
    region: row.region,
    status: row.status,
    kidsOnly: row.kids_only,
    ages: row.age_categories,
    bookingStatus: row.booking_status,
    booking: row.booking_link,
    organiserUrl: row.organiser_url,
  };
}

function toClub(row: ClubRow): Club {
  return {
    id: row.id,
    name: row.name,
    location: row.location,
    website: row.website,
    disciplines: row.disciplines,
    ageNote: row.age_note,
    kidsOnly: row.kids_only,
    founded: row.founded,
    summary: row.summary,
  };
}

export async function getEvents(): Promise<CalendarEvent[]> {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .gte("start_datetime", today)
    .order("start_datetime", { ascending: true });

  if (error) throw error;
  return (data as EventRow[]).map(toCalendarEvent);
}

export async function getClubs(): Promise<Club[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("clubs").select("*").order("name");

  if (error) throw error;
  return (data as ClubRow[]).map(toClub);
}

export async function getEventRowById(id: string): Promise<EventRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("events").select("*").eq("id", id).single();

  if (error) return null;
  return data as EventRow;
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

// super_admin's own row is deliberately excluded — this list is only for
// the "demote back to organiser" management UI, which should never offer to
// demote a super_admin.
export async function getAdminProfiles(): Promise<ProfileRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("profiles").select("*").eq("role", "admin").order("email", { ascending: true });

  if (error) throw error;
  return data as ProfileRow[];
}

export async function getWatchedSources(): Promise<WatchedSourceRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("watched_sources")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data as WatchedSourceRow[];
}
