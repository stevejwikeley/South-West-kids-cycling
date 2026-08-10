import { notFound } from "next/navigation";
import { getEventRowById } from "@/lib/data";
import SuggestChangeForm from "@/components/events/SuggestChangeForm";

export default async function SuggestChangePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = await getEventRowById(id);
  if (!event) notFound();

  return (
    <header style={{ maxWidth: 1100, margin: "0 auto", padding: "56px 24px 120px" }}>
      <div className="mono" style={{ fontSize: 11.5, letterSpacing: "0.12em", color: "#E0102A", marginBottom: 16, fontWeight: 700 }}>SUGGEST A CHANGE</div>
      <h1 className="disp" style={{ fontSize: "clamp(28px, 4.5vw, 40px)", lineHeight: 1.05, margin: 0, marginBottom: 28, letterSpacing: "-0.01em" }}>
        {event.title}
      </h1>
      <SuggestChangeForm event={event} />
    </header>
  );
}
