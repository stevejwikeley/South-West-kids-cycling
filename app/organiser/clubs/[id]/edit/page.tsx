import { notFound } from "next/navigation";
import ClubForm from "@/components/clubs/ClubForm";
import { getClubById } from "@/lib/data";

export default async function EditOrganiserClubPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const club = await getClubById(id);
  if (!club) notFound();

  return (
    <header style={{ maxWidth: 1100, margin: "0 auto", padding: "56px 24px 120px" }}>
      <div className="mono" style={{ fontSize: 11.5, letterSpacing: "0.12em", color: "#E0102A", marginBottom: 16, fontWeight: 700 }}>ORGANISER</div>
      <h1 className="disp" style={{ fontSize: "clamp(28px, 4.5vw, 40px)", lineHeight: 1.05, margin: 0, marginBottom: 28, letterSpacing: "-0.01em" }}>
        Edit club.
      </h1>
      <ClubForm club={club} redirectTo="/organiser/clubs" />
    </header>
  );
}
