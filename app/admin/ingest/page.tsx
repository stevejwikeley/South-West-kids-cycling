import Link from "next/link";
import IngestTextForm from "@/components/events/IngestTextForm";
import IngestFileForm from "@/components/events/IngestFileForm";

export default function AdminIngestPage() {
  return (
    <header style={{ maxWidth: 1100, margin: "0 auto", padding: "56px 24px 120px" }}>
      <div className="mono" style={{ fontSize: 11.5, letterSpacing: "0.12em", color: "#E0102A", marginBottom: 16, fontWeight: 700 }}>ADMIN</div>
      <h1 className="disp" style={{ fontSize: "clamp(32px, 5.2vw, 52px)", lineHeight: 1.02, margin: 0, letterSpacing: "-0.01em" }}>
        Smart ingestion.
      </h1>
      <p style={{ maxWidth: 560, fontSize: 14, lineHeight: 1.6, color: "#4A4A46", marginTop: 22 }}>
        Paste a listing URL, paste text (e.g. a Facebook post), or upload a poster image or CSV spreadsheet. One shared extraction engine reads whatever you give it and sends every event it finds to the{" "}
        <Link href="/admin/pending" style={{ borderBottom: "1px solid #111111" }}>pending queue</Link> for review — nothing publishes automatically.
      </p>

      <div style={{ display: "flex", gap: 56, flexWrap: "wrap", marginTop: 40 }}>
        <div>
          <h2 className="disp" style={{ fontSize: 18, marginBottom: 14 }}>Paste a URL or text</h2>
          <IngestTextForm />
        </div>
        <div>
          <h2 className="disp" style={{ fontSize: 18, marginBottom: 14 }}>Upload a file</h2>
          <IngestFileForm />
        </div>
      </div>
    </header>
  );
}
