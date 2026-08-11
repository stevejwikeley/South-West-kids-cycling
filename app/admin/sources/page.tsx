import { getWatchedSources } from "@/lib/data";
import WatchedSourceForm from "@/components/admin/WatchedSourceForm";
import WatchedSourceList from "@/components/admin/WatchedSourceList";

export default async function AdminSourcesPage() {
  const sources = await getWatchedSources();

  return (
    <header style={{ maxWidth: 1100, margin: "0 auto", padding: "56px 24px 120px" }}>
      <div className="mono" style={{ fontSize: 11.5, letterSpacing: "0.12em", color: "#E0102A", marginBottom: 16, fontWeight: 700 }}>ADMIN</div>
      <h1 className="disp" style={{ fontSize: "clamp(32px, 5.2vw, 52px)", lineHeight: 1.02, margin: 0, letterSpacing: "-0.01em" }}>
        Watched sources.
      </h1>
      <p style={{ maxWidth: 560, fontSize: 14, lineHeight: 1.6, color: "#4A4A46", marginTop: 22 }}>
        Pages listed here are scanned automatically on a schedule and run through the same extraction engine as manual smart ingestion. Anything found lands in the pending queue for review — nothing publishes automatically.
      </p>

      <div style={{ display: "flex", gap: 56, flexWrap: "wrap", marginTop: 40 }}>
        <div style={{ flex: "1 1 420px" }}>
          <h2 className="disp" style={{ fontSize: 18, marginBottom: 14 }}>Add a source</h2>
          <WatchedSourceForm />
        </div>
        <div style={{ flex: "2 1 480px", minWidth: 0 }}>
          <h2 className="disp" style={{ fontSize: 18, marginBottom: 14 }}>Currently watching ({sources.length})</h2>
          <WatchedSourceList sources={sources} />
        </div>
      </div>
    </header>
  );
}
