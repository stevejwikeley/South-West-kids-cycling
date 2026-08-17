"use client";

import { useTransition } from "react";
import { promoteToAdminById, demoteToOrganiser } from "@/app/admin/actions";
import type { ProfileRow, UserRole } from "@/lib/supabase/types";

const ROLE_LABEL: Record<UserRole, string> = {
  super_admin: "SUPER ADMIN",
  admin: "ADMIN",
  organiser: "ORGANISER",
};

const ROLE_COLOR: Record<UserRole, { bg: string; fg: string }> = {
  super_admin: { bg: "#111111", fg: "#FAFAF8" },
  admin: { bg: "#EAF3EC", fg: "#1F5D3A" },
  organiser: { bg: "#F3F2EE", fg: "#6B6B66" },
};

function RoleBadge({ role }: { role: UserRole }) {
  const c = ROLE_COLOR[role];
  return (
    <span className="mono" style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", letterSpacing: "0.03em", background: c.bg, color: c.fg }}>
      {ROLE_LABEL[role]}
    </span>
  );
}

function RoleAction({ member }: { member: ProfileRow }) {
  const [isPending, startTransition] = useTransition();

  if (member.role === "organiser") {
    return (
      <button
        onClick={() => startTransition(async () => { await promoteToAdminById(member.id); })}
        disabled={isPending}
        className="mono"
        style={{ fontSize: 11, color: "#1F5D3A", background: "none", border: "1px solid #D8D6D0", padding: "6px 12px", cursor: isPending ? "default" : "pointer", opacity: isPending ? 0.6 : 1 }}
      >
        {isPending ? "PROMOTING…" : "MAKE ADMIN"}
      </button>
    );
  }

  if (member.role === "admin") {
    return (
      <button
        onClick={() => startTransition(async () => { await demoteToOrganiser(member.id); })}
        disabled={isPending}
        className="mono"
        style={{ fontSize: 11, color: "#A13A2A", background: "none", border: "1px solid #D8D6D0", padding: "6px 12px", cursor: isPending ? "default" : "pointer", opacity: isPending ? 0.6 : 1 }}
      >
        {isPending ? "REMOVING…" : "REMOVE ADMIN"}
      </button>
    );
  }

  return null;
}

export default function TeamTable({ team, canManage }: { team: ProfileRow[]; canManage: boolean }) {
  if (team.length === 0) {
    return <p style={{ color: "#6B6B66", fontSize: 13.5 }}>Nobody has access yet.</p>;
  }

  return (
    <div style={{ borderTop: "2px solid #111111" }}>
      {team.map((m) => (
        <div key={m.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 6px", borderBottom: "1px solid #E4E2DD", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13.5 }}>{m.email}</span>
            <RoleBadge role={m.role} />
          </div>
          {canManage && <RoleAction member={m} />}
        </div>
      ))}
    </div>
  );
}
