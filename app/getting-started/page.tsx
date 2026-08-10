export default function Page() {
  return (
    <header style={{ maxWidth: 1100, margin: "0 auto", padding: "56px 24px 120px" }}>
      <div className="mono" style={{ fontSize: 11.5, letterSpacing: "0.12em", color: "#E0102A", marginBottom: 16, fontWeight: 700 }}>NEW TO RACING</div>
      <h1 className="disp" style={{ fontSize: "clamp(38px, 6.5vw, 76px)", lineHeight: 0.98, margin: 0, letterSpacing: "-0.01em" }}>
        Getting started.
      </h1>
      <p style={{ maxWidth: 480, fontSize: 16, lineHeight: 1.6, color: "#4A4A46", marginTop: 22 }}>
        This page is coming soon — a plain-English guide for parents on what the different disciplines involve, what to bring, and how to find the right first race.
      </p>
    </header>
  );
}
