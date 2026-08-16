import Link from "next/link";
import { Calendar, Mail } from "lucide-react";
import SubscribeSelector from "@/components/SubscribeSelector";
import EmailSubscribeForm from "@/components/EmailSubscribeForm";

export const metadata = {
  title: "Subscribe to the calendar",
  description: "Add the South West Kids Cycling calendar to your phone or computer so it stays up to date automatically.",
};

export default function SubscribePage() {
  return (
    <header style={{ maxWidth: 720, margin: "0 auto", padding: "56px 24px 120px" }}>
      <div className="mono" style={{ fontSize: 11.5, letterSpacing: "0.12em", color: "#E0102A", marginBottom: 16, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
        <Calendar size={13} /> SUBSCRIBE
      </div>
      <h1 className="disp" style={{ fontSize: "clamp(28px, 4.5vw, 44px)", lineHeight: 1.05, margin: 0, letterSpacing: "-0.01em" }}>
        A calendar that keeps itself up to date.
      </h1>
      <p style={{ maxWidth: 520, fontSize: 16, lineHeight: 1.65, color: "#4A4A46", marginTop: 22 }}>
        Subscribe once and every event lands in the calendar you already use — on your phone, your computer, wherever. When a booking link goes live, a date changes, or a new race gets added, it updates itself. No app to check, nothing to remember.
      </p>
      <p style={{ maxWidth: 520, fontSize: 14, lineHeight: 1.6, color: "#6B6B66", marginTop: 12 }}>
        The setup below takes a couple of minutes and only needs doing once — most calendar apps then check for updates automatically, roughly once a day.
      </p>

      <div style={{ marginTop: 44 }}>
        <SubscribeSelector />
      </div>

      <div style={{ marginTop: 48, paddingTop: 32, borderTop: "1px solid #E4E2DD" }}>
        <div className="mono" style={{ fontSize: 11.5, letterSpacing: "0.12em", color: "#E0102A", marginBottom: 12, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
          <Mail size={13} /> PREFER EMAIL?
        </div>
        <p style={{ maxWidth: 480, fontSize: 15, lineHeight: 1.6, color: "#4A4A46", marginBottom: 20 }}>
          Get a monthly email instead — a short list of what&apos;s coming up in the next month, no calendar app required.
        </p>
        <EmailSubscribeForm />
      </div>

      <div style={{ marginTop: 48, paddingTop: 24, borderTop: "1px solid #E4E2DD" }}>
        <Link href="/" style={{ fontSize: 13.5, fontWeight: 700, borderBottom: "1px solid #111111", paddingBottom: 2 }}>
          ← Back to the calendar
        </Link>
      </div>
    </header>
  );
}
