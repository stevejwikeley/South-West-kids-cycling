import { notFound } from "next/navigation";
import { getEventRowById, getBookingsForEvent } from "@/lib/data";
import AttendeesList from "@/components/events/AttendeesList";

export default async function AdminAttendeesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = await getEventRowById(id);
  if (!event) notFound();
  const bookings = await getBookingsForEvent(id);

  return (
    <header style={{ maxWidth: 1100, margin: "0 auto", padding: "56px 24px 120px" }}>
      <div className="mono" style={{ fontSize: 11.5, letterSpacing: "0.12em", color: "#E0102A", marginBottom: 16, fontWeight: 700 }}>ADMIN</div>
      <h1 className="disp" style={{ fontSize: "clamp(28px, 4.5vw, 40px)", lineHeight: 1.05, margin: 0, marginBottom: 28, letterSpacing: "-0.01em" }}>
        Attendees — {event.title}
      </h1>
      <AttendeesList eventTitle={event.title} bookings={bookings} capacity={event.booking_capacity} />
    </header>
  );
}
