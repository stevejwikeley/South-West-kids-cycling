import { createClient } from "@/lib/supabase/server";
import { PUBLIC_EVENT_SELECT, type PublicEventRow } from "@/lib/supabase/columns";
import { buildCalendar } from "@/lib/calendar-ics";

// Generated live on every request from the approved events table (spec
// section 9), not a batch job — a new approval shows up on the subscriber's
// next refresh with no separate publish step.
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("events")
    .select(PUBLIC_EVENT_SELECT)
    .eq("approved", true)
    .neq("status", "cancelled")
    .order("start_datetime", { ascending: true });

  if (error) {
    return new Response("Failed to load events", { status: 500 });
  }

  const { error: icsError, value } = buildCalendar(data as unknown as PublicEventRow[]);

  if (icsError || !value) {
    return new Response("Failed to generate calendar", { status: 500 });
  }

  return new Response(value, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="calendar.ics"',
    },
  });
}
