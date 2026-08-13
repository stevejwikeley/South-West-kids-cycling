import Link from "next/link";

export const metadata = {
  title: "About",
  description: "Why South West Kids Cycling exists, and who built it.",
};

export default function AboutPage() {
  return (
    <header style={{ maxWidth: 640, margin: "0 auto", padding: "56px 24px 120px" }}>
      <div className="mono" style={{ fontSize: 11.5, letterSpacing: "0.12em", color: "#E0102A", marginBottom: 16, fontWeight: 700 }}>ABOUT</div>
      <h1 className="disp" style={{ fontSize: "clamp(28px, 4.5vw, 44px)", lineHeight: 1.05, margin: 0, letterSpacing: "-0.01em" }}>
        Why I built this.
      </h1>

      <div style={{ marginTop: 30, fontSize: 16, lineHeight: 1.75, color: "#4A4A46" }}>
        <p style={{ marginBottom: 20 }}>
          I&apos;m a parent trying to keep track of race weekends. Youth cycling events across Devon and Cornwall are scattered across half a dozen Facebook groups, individual club and organiser websites, British Cycling&apos;s own listings, and the odd email — and when you&apos;re trying to plan months out (are we free that weekend, or is my child racing? where even is the venue?), piecing all of that together every time got old fast.
        </p>
        <p style={{ marginBottom: 20 }}>
          So I built one calendar that pulls it all into a single place — every discipline, every club, one list you can actually plan around.
        </p>
        <p style={{ marginBottom: 20 }}>
          It&apos;s personal beyond just convenience, too. I&apos;m a coach at Mid Devon CC and co-host the Wednesday evening Haldon MTB ride, and I want to see more kids get into cycling, find a club, and try their first race. If a straightforward calendar makes that half a step easier for one more family, it&apos;s done its job.
        </p>
        <p style={{ color: "#6B6B66" }}>
          — Steve Wikeley
        </p>
      </div>

      <div style={{ marginTop: 48, paddingTop: 24, borderTop: "1px solid #E4E2DD" }}>
        <Link href="/" style={{ fontSize: 13.5, fontWeight: 700, borderBottom: "1px solid #111111", paddingBottom: 2 }}>
          ← Back to the calendar
        </Link>
      </div>
    </header>
  );
}
