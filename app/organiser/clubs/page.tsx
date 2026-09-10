import Link from "next/link";
import { getClubs } from "@/lib/data";
import ClubList from "@/components/clubs/ClubList";

export default async function OrganiserClubsPage() {
  const clubs = await getClubs();

  return (
    <header style={{ maxWidth: 1100, margin: "0 auto", padding: "56px 24px 120px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
        <div>
          <div className="mono" style={{ fontSize: 11.5, letterSpacing: "0.12em", color: "#E0102A", marginBottom: 16, fontWeight: 700 }}>ORGANISER</div>
          <h1 className="disp" style={{ fontSize: "clamp(32px, 5.2vw, 52px)", lineHeight: 1.02, margin: 0, letterSpacing: "-0.01em" }}>
            Clubs.
          </h1>
        </div>
        <Link href="/organiser/clubs/new" style={{ display: "inline-block", background: "#111111", color: "#FAFAF8", border: "none", padding: "11px 20px", fontWeight: 700, fontSize: 13 }}>
          + Add club
        </Link>
      </div>

      <p style={{ maxWidth: 480, fontSize: 14, lineHeight: 1.6, color: "#4A4A46", marginTop: 22 }}>
        Clubs shown on the public directory and available to link from any event — shared across every organiser, not just your own.
      </p>

      <div style={{ marginTop: 36 }}>
        <ClubList clubs={clubs} editBasePath="/organiser/clubs" />
      </div>
    </header>
  );
}
