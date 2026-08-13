"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Rss } from "lucide-react";
import { trackEvent } from "@/lib/analytics";

const ITEMS: [string, string][] = [
  ["/", "CALENDAR"],
  ["/clubs", "CLUBS"],
  ["/getting-started", "GETTING STARTED"],
];

export default function TopNav({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname();
  const items = isAdmin ? [...ITEMS, ["/admin", "ADMIN"] as [string, string]] : ITEMS;

  return (
    <div style={{ borderBottom: "1px solid #E4E2DD" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "18px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <Link href="/" className="disp" style={{ fontSize: 15, letterSpacing: "0.02em", color: "#111111", whiteSpace: "nowrap", flexShrink: 0 }}>
          SOUTH WEST KIDS CYCLING
        </Link>
        <div className="mono" style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 4, fontSize: 11.5, letterSpacing: "0.03em" }}>
          {items.map(([href, label]) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                style={{
                  fontFamily: "var(--font-jetbrains-mono), monospace",
                  fontSize: 11.5,
                  letterSpacing: "0.03em",
                  color: active ? "#111111" : "#9A9992",
                  padding: "8px 14px",
                  borderBottom: `2px solid ${active ? "#E0102A" : "transparent"}`,
                }}
              >
                {label}
              </Link>
            );
          })}
          <Link
            href="/subscribe"
            onClick={() => trackEvent("subscribe_click", { source: "nav" })}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontFamily: "var(--font-jetbrains-mono), monospace",
              fontSize: 11.5,
              fontWeight: 700,
              letterSpacing: "0.03em",
              background: "#111111",
              color: "#FAFAF8",
              padding: "8px 14px",
              marginLeft: 4,
            }}
          >
            <Rss size={13} /> SUBSCRIBE
          </Link>
        </div>
      </div>
    </div>
  );
}
