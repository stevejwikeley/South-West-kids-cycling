import Link from "next/link";
import UnsubscribeButton from "@/components/UnsubscribeButton";

export const metadata = {
  title: "Unsubscribe",
};

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <header style={{ maxWidth: 560, margin: "0 auto", padding: "56px 24px 120px" }}>
      <h1 className="disp" style={{ fontSize: "clamp(26px, 4vw, 36px)", lineHeight: 1.1, margin: 0, letterSpacing: "-0.01em" }}>
        Unsubscribe from the monthly digest?
      </h1>

      <div style={{ marginTop: 32 }}>
        {token ? (
          <UnsubscribeButton token={token} />
        ) : (
          <p style={{ fontSize: 15, lineHeight: 1.6, color: "#4A4A46" }}>That link is missing its token — use the unsubscribe link from one of our emails.</p>
        )}
      </div>

      <div style={{ marginTop: 48, paddingTop: 24, borderTop: "1px solid #E4E2DD" }}>
        <Link href="/" style={{ fontSize: 13.5, fontWeight: 700, borderBottom: "1px solid #111111", paddingBottom: 2 }}>
          ← Back to the calendar
        </Link>
      </div>
    </header>
  );
}
