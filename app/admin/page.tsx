import { getCurrentProfile } from "@/lib/auth";
import InviteOrganiserForm from "./InviteOrganiserForm";
import SignOutButton from "./SignOutButton";

export default async function AdminPage() {
  const profile = await getCurrentProfile();

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
        Signed in as {profile?.email}. Pending-queue review, live-event editing and watched-source management land in later phases — for now this is where you invite organiser accounts.
      </p>

      <div style={{ marginTop: 40, maxWidth: 360 }}>
        <h2 className="disp" style={{ fontSize: 18, marginBottom: 14 }}>Invite an organiser</h2>
        <InviteOrganiserForm />
      </div>
    </header>
  );
}
