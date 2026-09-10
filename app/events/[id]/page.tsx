import { notFound } from "next/navigation";
import { getClubById, getEventRowById, getEventSpacesLeft } from "@/lib/data";
import { eventDisc } from "@/lib/mock-data";
import { fmtDay } from "@/lib/format";
import SignupForm from "@/components/events/SignupForm";

export default async function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = await getEventRowById(id);
  if (!event || !event.approved) notFound();
  const club = event.club_id ? await getClubById(event.club_id) : null;

  const d = eventDisc(event.discipline);
  const f = fmtDay(event.start_datetime.slice(0, 10));

  return (
    <header style={{ maxWidth: 720, margin: "0 auto", padding: "56px 24px 120px" }}>
      <div className="mono" style={{ fontSize: 11.5, letterSpacing: "0.12em", color: d.color, marginBottom: 16, fontWeight: 700 }}>
        {f.day} {f.mon} &middot; {d.label.toUpperCase()}
      </div>
      <h1 className="disp" style={{ fontSize: "clamp(28px, 4.5vw, 44px)", lineHeight: 1.05, margin: 0, marginBottom: 20, letterSpacing: "-0.01em" }}>
        {event.title}
      </h1>
      <div style={{ fontSize: 14.5, lineHeight: 1.7, color: "#4A4A46" }}>
        <p><strong>Venue:</strong> {event.venue_name}{event.address ? `, ${event.address}` : ""}</p>
        <p><strong>Ages:</strong> {event.age_categories.map((a) => a.toUpperCase()).join(", ") || "All ages"}</p>
        {event.kids_only && <p>Kids only — no adults racing alongside.</p>}
        {event.organiser_name && <p><strong>Organiser:</strong> {event.organiser_name}</p>}
        {club && <p><strong>Club:</strong> {club.name}</p>}
      </div>

      {event.bookable ? (
        <div style={{ marginTop: 28 }}>
          <SignupForm eventId={event.id} spacesLeft={await getEventSpacesLeft(event.id)} />
        </div>
      ) : (
        <div style={{ marginTop: 28 }}>
          <a
            href={event.booking_status === "open" ? event.booking_link ?? event.organiser_url : event.organiser_url}
            style={{ display: "inline-block", background: "#111111", color: "#FAFAF8", border: "none", padding: "12px 24px", fontWeight: 700, fontSize: 13.5 }}
          >
            {event.booking_status === "open" ? "Book" : "Organiser's website"}
          </a>
        </div>
      )}
    </header>
  );
}
