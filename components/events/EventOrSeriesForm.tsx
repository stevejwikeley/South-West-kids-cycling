"use client";

import { useState } from "react";
import EventForm from "@/components/events/EventForm";
import SeriesForm from "@/components/events/SeriesForm";
import type { Club } from "@/lib/types";

const tabBtn = (active: boolean): React.CSSProperties => ({
  padding: "8px 16px",
  fontSize: 12.5,
  fontWeight: 700,
  letterSpacing: "0.02em",
  background: active ? "#111111" : "transparent",
  color: active ? "#FAFAF8" : "#6B6B66",
  border: "1px solid #111111",
  cursor: "pointer",
});

// Only used on the create-new pages — converting an existing event into a
// series (or vice versa) after the fact is out of scope, so the edit pages
// render EventForm/SeriesForm directly instead of this toggle.
export default function EventOrSeriesForm({ redirectTo, clubs = [] }: { redirectTo: string; clubs?: Club[] }) {
  const [mode, setMode] = useState<"single" | "series">("single");

  return (
    <div>
      <div className="mono" style={{ display: "flex", marginBottom: 28 }}>
        <button type="button" onClick={() => setMode("single")} style={{ ...tabBtn(mode === "single"), borderRight: "none" }}>
          One-off event
        </button>
        <button type="button" onClick={() => setMode("series")} style={tabBtn(mode === "series")}>
          Repeating event
        </button>
      </div>
      {mode === "single" ? <EventForm redirectTo={redirectTo} clubs={clubs} /> : <SeriesForm redirectTo={redirectTo} clubs={clubs} />}
    </div>
  );
}
