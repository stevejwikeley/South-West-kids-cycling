import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth";
import { getMyEventRows, getMySeriesRows } from "@/lib/data";
import SignOutButton from "@/app/admin/SignOutButton";
import EventList from "@/components/events/EventList";
import SeriesList from "@/components/events/SeriesList";
import EmbedSnippet from "@/components/EmbedSnippet";

export default async function OrganiserPage() {
  const profile = await getCurrentProfile();
  const events = profile ? await getMyEventRows(profile.id) : [];
  const series = profile ? await getMySeriesRows(profile.id) : [];

  return (
    <header style={{ maxWidth: 1100, margin: "0 auto", padding: "56px 24px 120px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
        <div>
          <div className="mono" style={{ fontSize: 11.5, letterSpacing: "0.12em", color: "#E0102A", marginBottom: 16, fontWeight: 700 }}>ORGANISER</div>
          <h1 className="disp" style={{ fontSize: "clamp(32px, 5.2vw, 52px)", lineHeight: 1.02, margin: 0, letterSpacing: "-0.01em" }}>
            Your events.
          </h1>
        </div>
        <SignOutButton />
      </div>

      <p style={{ maxWidth: 480, fontSize: 14, lineHeight: 1.6, color: "#4A4A46", marginTop: 22 }}>
        Signed in as {profile?.email}. Events you add here publish straight to the public calendar.
      </p>

      <div style={{ marginTop: 28, display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Link href="/organiser/events/new" style={{ display: "inline-block", background: "#111111", color: "#FAFAF8", border: "none", padding: "11px 20px", fontWeight: 700, fontSize: 13 }}>
          + Add event
        </Link>
        <Link href="/organiser/clubs" className="mono" style={{ display: "inline-block", background: "none", color: "#111111", border: "1px solid #111111", padding: "11px 20px", fontWeight: 700, fontSize: 13 }}>
          Manage clubs
        </Link>
      </div>

      <div style={{ marginTop: 36 }}>
        <EventList events={events} editBasePath="/organiser/events" redirectTo="/organiser" />
      </div>

      <div style={{ marginTop: 48 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <h2 className="disp" style={{ fontSize: 18 }}>Recurring series</h2>
          <Link href="/organiser/series/new" style={{ display: "inline-block", background: "#111111", color: "#FAFAF8", border: "none", padding: "10px 18px", fontWeight: 700, fontSize: 12.5 }}>
            + Add recurring event
          </Link>
        </div>
        <SeriesList series={series} editBasePath="/organiser/series" />
      </div>

      <EmbedSnippet />
    </header>
  );
}
