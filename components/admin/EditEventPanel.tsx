"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import EventForm from "@/components/events/EventForm";
import { getEventForEdit } from "@/lib/actions/events";
import type { EventRow } from "@/lib/supabase/types";

export default function EditEventPanel({ eventId, onClose }: { eventId: string | null; onClose: () => void }) {
  const router = useRouter();
  const [event, setEvent] = useState<EventRow | null>(null);
  // Tracks which id `event` was fetched for, so loading is derived rather
  // than a separate state var set synchronously inside the effect.
  const [fetchedFor, setFetchedFor] = useState<string | null>(null);
  const loading = eventId !== null && fetchedFor !== eventId;

  useEffect(() => {
    if (!eventId) return;
    let cancelled = false;
    getEventForEdit(eventId).then((row) => {
      if (!cancelled) {
        setEvent(row);
        setFetchedFor(eventId);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  useEffect(() => {
    if (!eventId) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [eventId, onClose]);

  if (!eventId) return null;

  function handleSuccess() {
    onClose();
    router.refresh();
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100 }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(17,17,17,0.4)" }} />
      <div style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: "min(480px, 100vw)", background: "#FAFAF8", borderLeft: "1px solid #E4E2DD", overflowY: "auto", padding: "28px 24px 60px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <h2 className="disp" style={{ fontSize: 22, margin: 0 }}>Edit event.</h2>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", color: "#6B6B66", padding: 4, display: "flex" }}>
            <X size={20} />
          </button>
        </div>

        {loading && <p style={{ color: "#6B6B66", fontSize: 13.5 }}>Loading…</p>}
        {!loading && event && <EventForm event={event} redirectTo={null} onSuccess={handleSuccess} />}
        {!loading && !event && <p style={{ color: "#A13A2A", fontSize: 13.5 }}>Couldn&apos;t load this event.</p>}
      </div>
    </div>
  );
}
