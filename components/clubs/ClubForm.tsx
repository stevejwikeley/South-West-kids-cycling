"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { saveClub, deleteClub, type ClubFormState } from "@/lib/actions/clubs";
import ClubFields from "./ClubFields";
import { clubToValues, type ClubFieldValues } from "./club-form-values";
import type { Club } from "@/lib/types";

export default function ClubForm({ club, redirectTo }: { club?: Club; redirectTo: string }) {
  const router = useRouter();
  const boundSave = saveClub.bind(null, redirectTo);
  const [state, formAction, pending] = useActionState<ClubFormState, FormData>(boundSave, {});
  const [values, setValues] = useState<ClubFieldValues>(() => clubToValues(club));
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  function set<K extends keyof ClubFieldValues>(key: K, value: ClubFieldValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleDelete() {
    if (!club) return;
    if (!confirm(`Delete "${club.name}"? Any events linked to it will keep their other details but lose the club link. This can't be undone.`)) return;
    setDeleting(true);
    setDeleteError("");
    const result = await deleteClub(club.id);
    if (result.error) {
      setDeleting(false);
      setDeleteError(result.error);
      return;
    }
    router.push(redirectTo);
    router.refresh();
  }

  return (
    <form action={formAction} style={{ maxWidth: 480 }}>
      {club && <input type="hidden" name="id" value={club.id} />}

      <ClubFields values={values} onChange={set} withNames />

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          type="submit"
          disabled={pending}
          style={{ background: "#111111", color: "#FAFAF8", border: "none", padding: "12px 24px", fontWeight: 700, fontSize: 13.5, cursor: pending ? "default" : "pointer", opacity: pending ? 0.6 : 1 }}
        >
          {pending ? "Saving…" : club ? "Save changes" : "Add club"}
        </button>
        {club && (
          <button
            type="button"
            disabled={deleting}
            onClick={handleDelete}
            className="mono"
            style={{ fontSize: 12, fontWeight: 700, color: "#A13A2A", background: "none", border: "1px solid #D8D6D0", padding: "11px 20px", cursor: deleting ? "default" : "pointer", opacity: deleting ? 0.6 : 1 }}
          >
            {deleting ? "Deleting…" : "Delete club"}
          </button>
        )}
      </div>

      {state.error && <p style={{ color: "#A13A2A", fontSize: 12.5, marginTop: 14 }}>{state.error}</p>}
      {deleteError && <p style={{ color: "#A13A2A", fontSize: 12.5, marginTop: 14 }}>{deleteError}</p>}
    </form>
  );
}
