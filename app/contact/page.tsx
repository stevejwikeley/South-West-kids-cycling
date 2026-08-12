import Link from "next/link";
import ContactForm from "@/components/ContactForm";

export const metadata = {
  title: "Contact us",
  description: "Get in touch with South West Kids Cycling — general enquiries or requesting an organiser account.",
};

export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;
  const defaultReason = reason === "organiser" ? "organiser" : "general";

  return (
    <header style={{ maxWidth: 720, margin: "0 auto", padding: "56px 24px 120px" }}>
      <div className="mono" style={{ fontSize: 11.5, letterSpacing: "0.12em", color: "#E0102A", marginBottom: 16, fontWeight: 700 }}>CONTACT</div>
      <h1 className="disp" style={{ fontSize: "clamp(28px, 4.5vw, 44px)", lineHeight: 1.05, margin: 0, letterSpacing: "-0.01em" }}>
        Get in touch.
      </h1>
      <p style={{ maxWidth: 520, fontSize: 16, lineHeight: 1.65, color: "#4A4A46", marginTop: 22 }}>
        {defaultReason === "organiser"
          ? "Run youth cycling events and want to publish straight to the calendar? Tell us a bit about yourself and we'll set you up with an organiser account."
          : "Spotted a missing event, found a bug, or just want to say hello? Send a message and we'll get back to you."}
      </p>

      <div style={{ marginTop: 44 }}>
        <ContactForm defaultReason={defaultReason} />
      </div>

      <div style={{ marginTop: 48, paddingTop: 24, borderTop: "1px solid #E4E2DD" }}>
        <Link href="/" style={{ fontSize: 13.5, fontWeight: 700, borderBottom: "1px solid #111111", paddingBottom: 2 }}>
          ← Back to the calendar
        </Link>
      </div>
    </header>
  );
}
