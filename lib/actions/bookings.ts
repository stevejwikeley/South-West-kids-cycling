"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { parseBookingForm, type BookingFormValues } from "./parse-booking-form";
import { sendEmail } from "@/lib/email/resend";
import { buildBookingConfirmationHtml } from "@/lib/email/booking-confirmation";
import type { AttendeeRow, EventRow } from "@/lib/supabase/types";

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

  await admin.from("attendees").update({ contact_name: values.contactName, phone: values.phone }).eq("id", attendeeId);
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
