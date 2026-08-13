"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import SuggestChangeForm from "@/components/events/SuggestChangeForm";
import { getEventForSuggestChange } from "@/lib/actions/pending";
import type { EventRow } from "@/lib/supabase/types";

export default function SuggestChangePanel({ eventId, onClose }: { eventId: string | null; onClose: () => void }) {
  const [event, setEvent] = useState<EventRow | null>(null);
  // Tracks which id `event` was fetched for, so loading is derived rather
  // than a separate state var set synchronously inside the effect.
  const [fetchedFor, setFetchedFor] = useState<string | null>(null);
  const loading = eventId !== null && fetchedFor !== eventId;

  useEffect(() => {
    if (!eventId) return;
    let cancelled = false;
    getEventForSuggestChange(eventId).then((row) => {
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

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100 }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(17,17,17,0.4)" }} />
      <div style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: "min(480px, 100vw)", background: "#FAFAF8", borderLeft: "1px solid #E4E2DD", overflowY: "auto", padding: "28px 24px 60px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <div>
            <div className="mono" style={{ fontSize: 10.5, letterSpacing: "0.12em", color: "#E0102A", marginBottom: 8, fontWeight: 700 }}>SUGGEST A CHANGE</div>
            <h2 className="disp" style={{ fontSize: 20, margin: 0 }}>{event?.title ?? "Loading…"}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", color: "#6B6B66", padding: 4, display: "flex", flexShrink: 0 }}>
            <X size={20} />
          </button>
        </div>

        {loading && <p style={{ color: "#6B6B66", fontSize: 13.5 }}>Loading…</p>}
        {!loading && event && <SuggestChangeForm event={event} />}
        {!loading && !event && <p style={{ color: "#A13A2A", fontSize: 13.5 }}>Couldn&apos;t load this event.</p>}
      </div>
    </div>
  );
}
