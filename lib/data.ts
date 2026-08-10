import { createClient } from "@/lib/supabase/server";
import type { CalendarEvent, Club } from "@/lib/types";
import type { EventRow, ClubRow } from "@/lib/supabase/types";

function toCalendarEvent(row: EventRow): CalendarEvent {
  return {
    id: row.id,
    title: row.title,
    discipline: row.discipline,
    date: row.start_datetime.slice(0, 10),
    venue: row.venue_name,
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
  const { data, error } = await supabase
    .from("events")
    .select("*")
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
