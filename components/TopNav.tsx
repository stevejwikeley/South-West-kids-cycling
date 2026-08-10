"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS: [string, string][] = [
  ["/", "CALENDAR"],
  ["/clubs", "CLUBS"],
  ["/getting-started", "GETTING STARTED"],
];

export default function TopNav() {
  const pathname = usePathname();

  return (
    <div style={{ borderBottom: "1px solid #E4E2DD" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "18px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Link href="/" className="disp" style={{ fontSize: 15, letterSpacing: "0.02em", color: "#111111" }}>
          SOUTH WEST KIDS CYCLING
        </Link>
        <div className="mono" style={{ display: "flex", gap: 24, fontSize: 11.5, letterSpacing: "0.03em" }}>
          {ITEMS.map(([href, label]) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                style={{
                  paddingBottom: 3,
                  fontFamily: "var(--font-jetbrains-mono), monospace",
                  fontSize: 11.5,
                  letterSpacing: "0.03em",
                  color: active ? "#111111" : "#9A9992",
                  borderBottom: active ? "2px solid #E0102A" : "2px solid transparent",
                }}
              >
                {label}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
