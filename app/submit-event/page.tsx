import Link from "next/link";
import SubmitEventForm from "@/components/events/SubmitEventForm";

export const metadata = {
  title: "Submit an event",
  description: "Know about a youth cycling event that's missing from the calendar? Submit it here — no login needed.",
};

export default function SubmitEventPage() {
  return (
    <header style={{ maxWidth: 720, margin: "0 auto", padding: "56px 24px 120px" }}>
      <div className="mono" style={{ fontSize: 11.5, letterSpacing: "0.12em", color: "#E0102A", marginBottom: 16, fontWeight: 700 }}>SUBMIT AN EVENT</div>
      <h1 className="disp" style={{ fontSize: "clamp(28px, 4.5vw, 44px)", lineHeight: 1.05, margin: 0, letterSpacing: "-0.01em" }}>
        Event missing from the calendar?
      </h1>
      <p style={{ maxWidth: 520, fontSize: 16, lineHeight: 1.65, color: "#4A4A46", marginTop: 22 }}>
        Tell us about it — paste a link, paste some text, or fill in a form. No login needed, and every submission is reviewed before it goes live.
      </p>

      <div style={{ marginTop: 44 }}>
        <SubmitEventForm />
      </div>

      <div style={{ marginTop: 48, paddingTop: 24, borderTop: "1px solid #E4E2DD" }}>
        <Link href="/" style={{ fontSize: 13.5, fontWeight: 700, borderBottom: "1px solid #111111", paddingBottom: 2 }}>
          ← Back to the calendar
        </Link>
      </div>
    </header>
  );
}
