import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth";
import { getMyEventRows } from "@/lib/data";
import SignOutButton from "@/app/admin/SignOutButton";
import EventList from "@/components/events/EventList";

export default async function OrganiserPage() {
  const profile = await getCurrentProfile();
  const events = profile ? await getMyEventRows(profile.id) : [];

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

      <div style={{ marginTop: 28 }}>
        <Link href="/organiser/events/new" style={{ display: "inline-block", background: "#111111", color: "#FAFAF8", border: "none", padding: "11px 20px", fontWeight: 700, fontSize: 13 }}>
          + Add event
        </Link>
      </div>

      <div style={{ marginTop: 36 }}>
        <EventList events={events} editBasePath="/organiser/events" redirectTo="/organiser" />
      </div>
    </header>
  );
}
