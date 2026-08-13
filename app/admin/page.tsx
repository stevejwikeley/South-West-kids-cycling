import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth";
import { getAllEventRows, getPendingChangeRows, getAdminProfiles } from "@/lib/data";
import InviteOrganiserForm from "./InviteOrganiserForm";
import SignOutButton from "./SignOutButton";
import EventList from "@/components/events/EventList";
import ManageAdmins from "@/components/admin/ManageAdmins";

export default async function AdminPage() {
  const profile = await getCurrentProfile();
  const isSuperAdmin = profile?.role === "super_admin";
  const [events, pending, admins] = await Promise.all([
    getAllEventRows(),
    getPendingChangeRows(),
    isSuperAdmin ? getAdminProfiles() : Promise.resolve([]),
  ]);

  return (
    <header style={{ maxWidth: 1100, margin: "0 auto", padding: "56px 24px 120px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
        <div>
          <div className="mono" style={{ fontSize: 11.5, letterSpacing: "0.12em", color: "#E0102A", marginBottom: 16, fontWeight: 700 }}>ADMIN</div>
          <h1 className="disp" style={{ fontSize: "clamp(32px, 5.2vw, 52px)", lineHeight: 1.02, margin: 0, letterSpacing: "-0.01em" }}>
            Dashboard.
          </h1>
        </div>
        <SignOutButton />
      </div>

      <p style={{ maxWidth: 480, fontSize: 14, lineHeight: 1.6, color: "#4A4A46", marginTop: 22 }}>
        Signed in as {profile?.email} ({isSuperAdmin ? "super admin" : "admin"}).
      </p>

      <div style={{ marginTop: 28, display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Link href="/admin/pending" style={{ display: "inline-flex", alignItems: "center", gap: 10, background: pending.length > 0 ? "#111111" : "transparent", color: pending.length > 0 ? "#FAFAF8" : "#111111", border: "1px solid #111111", padding: "11px 20px", fontWeight: 700, fontSize: 13 }}>
          Pending queue
          {pending.length > 0 && (
            <span className="mono" style={{ background: "#E0102A", color: "#FAFAF8", borderRadius: 999, padding: "2px 8px", fontSize: 11 }}>{pending.length}</span>
          )}
        </Link>
        <Link href="/admin/ingest" style={{ display: "inline-flex", alignItems: "center", background: "transparent", color: "#111111", border: "1px solid #111111", padding: "11px 20px", fontWeight: 700, fontSize: 13 }}>
          Smart ingestion
        </Link>
        <Link href="/admin/sources" style={{ display: "inline-flex", alignItems: "center", background: "transparent", color: "#111111", border: "1px solid #111111", padding: "11px 20px", fontWeight: 700, fontSize: 13 }}>
          Watched sources
        </Link>
      </div>

      <div style={{ marginTop: 40, maxWidth: 360 }}>
        <h2 className="disp" style={{ fontSize: 18, marginBottom: 14 }}>Invite an organiser</h2>
        <InviteOrganiserForm />
      </div>

      {isSuperAdmin && (
        <div style={{ marginTop: 40, maxWidth: 420 }}>
          <h2 className="disp" style={{ fontSize: 18, marginBottom: 14 }}>Manage admins</h2>
          <ManageAdmins admins={admins} />
        </div>
      )}

      <div style={{ marginTop: 48 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <h2 className="disp" style={{ fontSize: 18 }}>All events</h2>
          <Link href="/admin/events/new" style={{ display: "inline-block", background: "#111111", color: "#FAFAF8", border: "none", padding: "10px 18px", fontWeight: 700, fontSize: 12.5 }}>
            + Add event
          </Link>
        </div>
        <EventList events={events} editBasePath="/admin/events" redirectTo="/admin" />
      </div>
    </header>
  );
}
