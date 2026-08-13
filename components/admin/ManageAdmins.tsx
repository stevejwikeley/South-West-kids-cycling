"use client";

import { useActionState, useTransition } from "react";
import { promoteToAdmin, demoteToOrganiser } from "@/app/admin/actions";
import type { ProfileRow } from "@/lib/supabase/types";

function DemoteButton({ userId }: { userId: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      onClick={() => startTransition(async () => { await demoteToOrganiser(userId); })}
      disabled={isPending}
      className="mono"
      style={{ fontSize: 11, color: "#A13A2A", background: "none", border: "1px solid #D8D6D0", padding: "6px 12px", cursor: isPending ? "default" : "pointer", opacity: isPending ? 0.6 : 1 }}
    >
      {isPending ? "REMOVING…" : "REMOVE"}
    </button>
  );
}

export default function ManageAdmins({ admins }: { admins: ProfileRow[] }) {
  const [state, formAction, pending] = useActionState(promoteToAdmin, {});

  return (
    <div>
      <label className="mono" style={{ fontSize: 10.5, color: "#6B6B66", display: "block", marginBottom: 6 }}>ORGANISER&apos;S EMAIL</label>
      <form action={formAction} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          type="email"
          name="email"
          required
          placeholder="organiser@club.co.uk"
          style={{ flex: 1, minWidth: 220, background: "#FFFFFF", border: "1px solid #D8D6D0", color: "#111111", padding: "10px 12px", fontSize: 14 }}
        />
        <button
          type="submit"
          disabled={pending}
          style={{ background: "#111111", color: "#FAFAF8", border: "none", padding: "10px 20px", fontWeight: 700, fontSize: 13, cursor: pending ? "default" : "pointer", opacity: pending ? 0.6 : 1 }}
        >
          {pending ? "Promoting…" : "Make admin"}
        </button>
      </form>
      {state.error && <p style={{ color: "#A13A2A", fontSize: 12.5, marginTop: 12 }}>{state.error}</p>}
      {state.success && <p style={{ color: "#1F5D3A", fontSize: 12.5, marginTop: 12 }}>{state.success}</p>}

      {admins.length > 0 && (
        <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 8 }}>
          {admins.map((a) => (
            <div key={a.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "8px 0", borderBottom: "1px solid #E4E2DD" }}>
              <span style={{ fontSize: 13.5 }}>{a.email}</span>
              <DemoteButton userId={a.id} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
