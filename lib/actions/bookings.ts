"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getActiveBookingCount } from "@/lib/data";
import { parseBookingForm, type BookingFormValues } from "./parse-booking-form";
import { sendEmail } from "@/lib/email/resend";
import { buildBookingConfirmationHtml } from "@/lib/email/booking-confirmation";
import { buildWaitlistPromotedHtml } from "@/lib/email/waitlist-promoted";
import type { AttendeeRow, EventRow } from "@/lib/supabase/types";
import { getCurrentProfile, isAdminRole } from "@/lib/auth";
import { buildAttendeeMessageHtml } from "@/lib/email/attendee-message";

export interface CreateBookingState {
  error?: string;
  success?: { status: "confirmed" | "waitlisted" };
}

async function findOrCreateAttendee(
  admin: ReturnType<typeof createAdminClient>,
  values: BookingFormValues
): Promise<string | null> {
  const { data: existing } = await admin.from("attendees").select("id").eq("email", values.email).maybeSingle();
  let attendeeId = (existing as Pick<AttendeeRow, "id"> | null)?.id ?? null;

  if (!attendeeId) {
    const { data: created, error } = await admin.auth.admin.createUser({
      email: values.email,
      email_confirm: true,
      user_metadata: { role: "attendee" },
    });
    if (error || !created.user) return null;
    attendeeId = created.user.id;
  }

  await admin.from("attendees").update({ contact_name: values.contactName, ...(values.phone ? { phone: values.phone } : {}) }).eq("id", attendeeId);
  return attendeeId;
}

export async function createBooking(
  eventId: string,
  _prevState: CreateBookingState,
  formData: FormData
): Promise<CreateBookingState> {
  const parsed = parseBookingForm(formData);
  if (!parsed.ok) return { error: parsed.error };

  const admin = createAdminClient();

  const { data: eventData, error: eventError } = await admin.from("events").select("*").eq("id", eventId).single();
  const event = eventData as EventRow | null;
  if (eventError || !event || !event.bookable) {
    return { error: "This event isn't taking bookings." };
  }

  const attendeeId = await findOrCreateAttendee(admin, parsed.values);
  if (!attendeeId) return { error: "Couldn't set up your account — try again." };

  const { data: result, error: rpcError } = await admin.rpc("create_booking", {
    p_event_id: eventId,
    p_attendee_id: attendeeId,
    p_people: parsed.values.people.map((p) => ({ name: p.name, age_category: p.ageCategory })),
  });
  if (rpcError || !result || result.length === 0) {
    return { error: rpcError?.message ?? "Couldn't complete the booking." };
  }
  const status = result[0].status as "confirmed" | "waitlisted";

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const { data: linkData } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: parsed.values.email,
    options: { redirectTo: `${siteUrl}/auth/confirm?next=/my-events` },
  });

  try {
    await sendEmail({
      to: parsed.values.email,
      subject: status === "confirmed" ? `You're in: ${event.title}` : `Waitlisted: ${event.title}`,
      html: buildBookingConfirmationHtml({
        event,
        status,
        people: parsed.values.people,
        manageUrl: linkData?.properties?.action_link ?? `${siteUrl}/my-events/login`,
      }),
    });
  } catch {
    // Booking is already saved — an email failure here must not undo it
    // (spec's "Error handling"). Deliberately swallowed, matching how the
    // rest of the app treats transactional email as best-effort.
  }

  return { success: { status } };
}

export interface CancelBookingResult {
  error?: string;
}

export async function cancelBooking(bookingId: string): Promise<CancelBookingResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { data, error } = await supabase.rpc("cancel_booking", { p_booking_id: bookingId });
  if (error) return { error: error.message };

  const promoted = data?.[0];
  if (promoted?.promoted_booking_id && promoted.promoted_attendee_id) {
    // The promoted booking belongs to a *different* attendee than the
    // caller — reading their email needs the service-role client, since
    // the caller's own RLS-bound session can't see another attendee's row.
    const admin = createAdminClient();
    const [{ data: attendee }, { data: event }] = await Promise.all([
      admin.from("attendees").select("email").eq("id", promoted.promoted_attendee_id).single(),
      admin.from("events").select("*").eq("id", promoted.cancelled_event_id).single(),
    ]);

    if (attendee && event) {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
      const { data: linkData } = await admin.auth.admin.generateLink({
        type: "magiclink",
        email: (attendee as { email: string }).email,
        options: { redirectTo: `${siteUrl}/auth/confirm?next=/my-events` },
      });
      try {
        await sendEmail({
          to: (attendee as { email: string }).email,
          subject: `You're in: ${(event as EventRow).title}`,
          html: buildWaitlistPromotedHtml(event as EventRow, linkData?.properties?.action_link ?? `${siteUrl}/my-events/login`),
        });
      } catch {
        // Best-effort, same as createBooking's confirmation email.
      }
    }
  }

  return {};
}

export async function getBookingCountForConfirm(eventId: string): Promise<number> {
  try {
    return await getActiveBookingCount(eventId);
  } catch {
    return 0;
  }
}

export interface MessageAttendeesState {
  error?: string;
  success?: string;
}

export async function messageAttendees(
  eventId: string,
  _prevState: MessageAttendeesState,
  formData: FormData
): Promise<MessageAttendeesState> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Not signed in." };

  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (!subject) return { error: "Subject is required." };
  if (!body) return { error: "Message is required." };

  // RLS does NOT scope this select to events the caller is allowed to
  // manage — the "public can read approved events" policy (0001_init.sql)
  // grants read access to any approved event's row regardless of
  // created_by. The explicit created_by/isAdminRole check just below is
  // what actually prevents an organiser from acting on another organiser's
  // event; RLS on bookings/booking_people/attendees is what actually
  // prevents booking-data leakage even without this check.
  const supabase = await createClient();
  const { data: event, error: eventError } = await supabase.from("events").select("id, title, created_by").eq("id", eventId).single();
  if (eventError || !event) return { error: "Event not found." };
  if (!isAdminRole(profile) && event.created_by !== profile.id) return { error: "Not authorised." };

  const { data: attendeeRows, error: attendeesError } = await supabase
    .from("bookings")
    .select("attendee:attendees(email)")
    .eq("event_id", eventId)
    .eq("status", "confirmed");
  if (attendeesError) return { error: attendeesError.message };

  const emails = [...new Set((attendeeRows as unknown as { attendee: { email: string } }[]).map((r) => r.attendee.email))];
  if (emails.length === 0) return { error: "No confirmed attendees to message yet." };

  const html = buildAttendeeMessageHtml(event.title, body);
  let sent = 0;
  for (const to of emails) {
    try {
      await sendEmail({ to, subject, html });
      sent++;
    } catch {
      // Best-effort per recipient, same pattern as the monthly-digest cron's
      // per-subscriber loop — one bad address shouldn't block the rest.
    }
  }

  return { success: `Sent to ${sent} of ${emails.length} attendee${emails.length === 1 ? "" : "s"}.` };
}
