"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { generateDescriptionAction } from "@/lib/actions/event-description";
import { updateEventDescription, type EventMissingDescription } from "@/lib/actions/event-description";

type Status = "pending" | "working" | "done" | "error";

// One-off admin tool: works through every live event with no description,
// one at a time (not Promise.all — this is calling an LLM + fetching an
// external page per event, so a sequential run with visible progress is
// safer than one big parallel burst that's harder to recover from if a
// few requests fail). Once every event has a description this component's
// parent (app/admin/page.tsx) stops rendering it at all, so there's
// nothing to remove by hand later.
export default function BackfillDescriptions({ events }: { events: EventMissingDescription[] }) {
  const router = useRouter();
  const [statuses, setStatuses] = useState<Record<string, Status>>(() => Object.fromEntries(events.map((e) => [e.id, "pending"])));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [running, setRunning] = useState(false);
  // A ref, not state — the loop below is a single long-running async
  // function whose closure would otherwise keep seeing the `stopRequested`
  // value from when handleRun was first called, never the updated one
  // from a later click on "Stop after current" mid-run.
  const stopRequestedRef = useRef(false);

  const doneCount = Object.values(statuses).filter((s) => s === "done").length;
  const errorCount = Object.values(statuses).filter((s) => s === "error").length;

  async function handleRun() {
    setRunning(true);
    stopRequestedRef.current = false;

    for (const event of events) {
      if (stopRequestedRef.current) break;
      setStatuses((prev) => ({ ...prev, [event.id]: "working" }));

      const { description, error } = await generateDescriptionAction(event.organiser_url, event.title, event.venue_name);
      if (error || !description) {
        setStatuses((prev) => ({ ...prev, [event.id]: "error" }));
        setErrors((prev) => ({ ...prev, [event.id]: error ?? "No description generated." }));
        continue;
      }

      const saveResult = await updateEventDescription(event.id, description);
      if (saveResult.error) {
        setStatuses((prev) => ({ ...prev, [event.id]: "error" }));
        setErrors((prev) => ({ ...prev, [event.id]: saveResult.error! }));
        continue;
      }

      setStatuses((prev) => ({ ...prev, [event.id]: "done" }));
    }

    setRunning(false);
    router.refresh();
  }

  return (
    <div style={{ marginTop: 28, padding: "16px 18px", background: "#F3F2EE", border: "1px solid #E4E2DD", maxWidth: 560 }}>
      <h3 className="mono" style={{ fontSize: 11, letterSpacing: "0.08em", color: "#6B6B66", marginBottom: 8 }}>
        MISSING DESCRIPTIONS
      </h3>
      <p style={{ fontSize: 13, lineHeight: 1.6, color: "#4A4A46", marginBottom: 12 }}>
        {events.length} event{events.length === 1 ? "" : "s"} {events.length === 1 ? "has" : "have"} no description yet. Generate them from each event&apos;s organiser URL, one at a time — you can stop partway through and pick up later.
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button
          type="button"
          disabled={running}
          onClick={handleRun}
          className="mono"
          style={{ background: "#111111", color: "#FAFAF8", border: "none", padding: "9px 16px", fontSize: 12.5, fontWeight: 700, cursor: running ? "default" : "pointer", opacity: running ? 0.6 : 1 }}
        >
          {running ? `Working… (${doneCount + errorCount}/${events.length})` : "Generate all"}
        </button>
        {running && (
          <button
            type="button"
            onClick={() => { stopRequestedRef.current = true; }}
            className="mono"
            style={{ background: "none", border: "1px solid #D8D6D0", padding: "9px 16px", fontSize: 12.5, fontWeight: 700, color: "#A13A2A", cursor: "pointer" }}
          >
            Stop after current
          </button>
        )}
      </div>

      {(doneCount > 0 || errorCount > 0) && (
        <p className="mono" style={{ fontSize: 11.5, color: "#6B6B66", marginBottom: 8 }}>
          {doneCount} done{errorCount > 0 ? ` · ${errorCount} failed` : ""}
        </p>
      )}

      {errorCount > 0 && (
        <ul style={{ fontSize: 12, color: "#A13A2A", paddingLeft: 18, margin: 0 }}>
          {events
            .filter((e) => statuses[e.id] === "error")
            .map((e) => (
              <li key={e.id}>
                {e.title}: {errors[e.id]}
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
