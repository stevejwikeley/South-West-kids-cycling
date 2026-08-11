import { getAllEventRows, getPendingChangeRows } from "@/lib/data";
import PendingQueue from "@/components/events/PendingQueue";

export default async function AdminPendingPage() {
  const [pending, liveEvents] = await Promise.all([getPendingChangeRows(), getAllEventRows()]);

  return (
    <header style={{ maxWidth: 1100, margin: "0 auto", padding: "56px 24px 120px" }}>
      <div className="mono" style={{ fontSize: 11.5, letterSpacing: "0.12em", color: "#E0102A", marginBottom: 16, fontWeight: 700 }}>ADMIN</div>
      <h1 className="disp" style={{ fontSize: "clamp(32px, 5.2vw, 52px)", lineHeight: 1.02, margin: 0, letterSpacing: "-0.01em" }}>
        Pending queue.
      </h1>
      <p style={{ maxWidth: 480, fontSize: 14, lineHeight: 1.6, color: "#4A4A46", marginTop: 22 }}>
        Suggested changes submitted via the public &quot;Suggest a change&quot; link on each event. Approving applies the change to the live event immediately.
      </p>

      <div style={{ marginTop: 36 }}>
        <PendingQueue pending={pending} liveEvents={liveEvents} redirectTo="/admin/pending" />
      </div>
    </header>
  );
}
