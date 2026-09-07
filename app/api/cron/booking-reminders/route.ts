// app/api/cron/booking-reminders/route.ts
import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/resend";
import { buildBookingReminderHtml } from "@/lib/email/booking-reminder";
import { ukMidnightUtcIso, ukTomorrowDateIso } from "@/lib/uk-time";
import type { EventRow } from "@/lib/supabase/types";

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const tomorrow = ukTomorrowDateIso();
  const dayAfter = new Date(`${tomorrow}T00:00:00.000Z`);
  dayAfter.setUTCDate(dayAfter.getUTCDate() + 1);

  const { data: events, error: eventsError } = await supabase
    .from("events")
    .select("*")
    .eq("bookable", true)
    .gte("start_datetime", ukMidnightUtcIso(tomorrow))
    .lt("start_datetime", dayAfter.toISOString());
  if (eventsError) return NextResponse.json({ error: eventsError.message }, { status: 500 });

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.southwestkidscycling.uk";
  let sent = 0;

  for (const event of events as EventRow[]) {
    const { data: bookings, error: bookingsError } = await supabase
      .from("bookings")
      .select("attendee:attendees(email)")
      .eq("event_id", event.id)
      .eq("status", "confirmed");
    if (bookingsError) continue;

    const emails = [...new Set((bookings as unknown as { attendee: { email: string } }[]).map((b) => b.attendee.email))];
    for (const email of emails) {
      const { data: linkData } = await supabase.auth.admin.generateLink({
        type: "magiclink",
        email,
        options: { redirectTo: `${siteUrl}/auth/confirm?next=/my-events` },
      });
      try {
        await sendEmail({
          to: email,
          subject: `Tomorrow: ${event.title}`,
          html: buildBookingReminderHtml(event, linkData?.properties?.action_link ?? `${siteUrl}/my-events/login`),
        });
        sent++;
      } catch {
        // Best-effort per recipient, same pattern as the other cron routes.
      }
    }
  }

  return NextResponse.json({ sent, events: events.length });
}
