import { getCurrentAttendee } from "@/lib/auth";
import { getMyBookings } from "@/lib/data";
import MyBookingsList from "@/components/events/MyBookingsList";

export default async function MyEventsPage() {
  const attendee = await getCurrentAttendee();
  const bookings = attendee ? await getMyBookings(attendee.id) : [];

  return (
    <header style={{ maxWidth: 1100, margin: "0 auto", padding: "56px 24px 120px" }}>
      <div className="mono" style={{ fontSize: 11.5, letterSpacing: "0.12em", color: "#E0102A", marginBottom: 16, fontWeight: 700 }}>MY BOOKINGS</div>
      <h1 className="disp" style={{ fontSize: "clamp(32px, 5.2vw, 52px)", lineHeight: 1.02, margin: 0, letterSpacing: "-0.01em" }}>
        Your events.
      </h1>
      <p style={{ maxWidth: 480, fontSize: 14, lineHeight: 1.6, color: "#4A4A46", marginTop: 22 }}>
        Signed in as {attendee?.email}.
      </p>
      <div style={{ marginTop: 36 }}>
        <MyBookingsList bookings={bookings} />
      </div>
    </header>
  );
}
