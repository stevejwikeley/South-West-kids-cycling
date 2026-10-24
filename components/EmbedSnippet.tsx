import Link from "next/link";

export default function EmbedSnippet() {
  return (
    <div style={{ marginTop: 40, maxWidth: 640, padding: "16px 18px", background: "#F3F2EE", border: "1px solid #E4E2DD" }}>
      <h3 className="mono" style={{ fontSize: 11, letterSpacing: "0.08em", color: "#6B6B66", marginBottom: 8 }}>
        EMBED THIS CALENDAR ON YOUR CLUB SITE
      </h3>
      <p style={{ fontSize: 13, lineHeight: 1.6, color: "#4A4A46", marginBottom: 12 }}>
        Give your members the full Devon, Cornwall &amp; Somerset youth calendar without leaving your own site. Filter it by region or discipline and get a ready-to-paste embed code, with a live preview.
      </p>
      <Link
        href="/embed-builder"
        className="mono"
        style={{ display: "inline-block", background: "#111111", color: "#FAFAF8", padding: "9px 16px", fontSize: 12.5, fontWeight: 700 }}
      >
        Open the embed builder →
      </Link>
    </div>
  );
}
