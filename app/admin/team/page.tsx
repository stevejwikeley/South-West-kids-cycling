import { getCurrentProfile } from "@/lib/auth";
import { getTeamProfiles } from "@/lib/data";
import InviteTeamMemberForm from "./InviteTeamMemberForm";
import TeamTable from "@/components/admin/TeamTable";

export default async function TeamPage() {
  const [profile, team] = await Promise.all([getCurrentProfile(), getTeamProfiles()]);
  const isSuperAdmin = profile?.role === "super_admin";

  return (
    <header style={{ maxWidth: 1100, margin: "0 auto", padding: "56px 24px 120px" }}>
      <div className="mono" style={{ fontSize: 11.5, letterSpacing: "0.12em", color: "#E0102A", marginBottom: 16, fontWeight: 700 }}>TEAM</div>
      <h1 className="disp" style={{ fontSize: "clamp(32px, 5.2vw, 52px)", lineHeight: 1.02, margin: 0, letterSpacing: "-0.01em" }}>
        Manage admins &amp; organisers.
      </h1>
      <p style={{ maxWidth: 520, fontSize: 14, lineHeight: 1.6, color: "#4A4A46", marginTop: 22 }}>
        {isSuperAdmin
          ? "Invite someone directly as an admin or organiser — they get an email invite and land with that role from their very first sign-in, no separate upgrade step needed."
          : "Invite an organiser to manage their own club's events."}
      </p>

      <div style={{ marginTop: 32, maxWidth: 420 }}>
        <h2 className="disp" style={{ fontSize: 18, marginBottom: 14 }}>Invite someone</h2>
        <InviteTeamMemberForm canInviteAdmin={isSuperAdmin} />
      </div>

      <div style={{ marginTop: 48, maxWidth: 640 }}>
        <h2 className="disp" style={{ fontSize: 18, marginBottom: 14 }}>Everyone with access</h2>
        <TeamTable team={team} canManage={isSuperAdmin} />
      </div>
    </header>
  );
}
