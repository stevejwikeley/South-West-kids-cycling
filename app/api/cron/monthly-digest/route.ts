import "server-only";
import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/resend";
import { buildMonthlyDigestHtml } from "@/lib/email/monthly-digest";
import type { EventRow, EmailSubscriberRow } from "@/lib/supabase/types";
import type { CalendarEvent } from "@/lib/types";

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

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.southwestkidscycling.uk";

  const today = new Date().toISOString().slice(0, 10);
  const in31Days = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const { data: eventRows, error: eventsError } = await supabase
    .from("events")
    .select("*")
    .gte("start_datetime", today)
    .lte("start_datetime", in31Days)
    .order("start_datetime", { ascending: true });

  if (eventsError) return NextResponse.json({ error: eventsError.message }, { status: 500 });

  const events = ((eventRows as EventRow[]) ?? []).map(toCalendarEvent);
  if (events.length === 0) {
    return NextResponse.json({ sent: 0, events: 0 });
  }

  const { data: subscriberRows, error: subscribersError } = await supabase
    .from("email_subscribers")
    .select("*")
    .is("unsubscribed_at", null);

  if (subscribersError) return NextResponse.json({ error: subscribersError.message }, { status: 500 });

  const subscribers = (subscriberRows as EmailSubscriberRow[]) ?? [];
  let sent = 0;

  for (const subscriber of subscribers) {
    const unsubscribeUrl = `${siteUrl}/unsubscribe?token=${subscriber.unsubscribe_token}`;
    try {
      await sendEmail({
        to: subscriber.email,
        subject: `${events.length} upcoming ${events.length === 1 ? "event" : "events"} — South West Kids Cycling`,
        html: buildMonthlyDigestHtml(events, siteUrl, unsubscribeUrl),
      });
      sent++;
    } catch (e) {
      Sentry.captureException(e, { tags: { operation: "monthly_digest_send", subscriber_id: subscriber.id } });
    }
  }

  return NextResponse.json({ sent, subscribers: subscribers.length, events: events.length });
}
