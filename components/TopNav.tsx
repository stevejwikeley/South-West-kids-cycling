"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { UserRole } from "@/lib/supabase/types";

const ITEMS: [string, string][] = [
  ["/", "CALENDAR"],
  ["/clubs", "CLUBS"],
  ["/getting-started", "GETTING STARTED"],
];

export default function TopNav({ role }: { role?: UserRole | null }) {
  const pathname = usePathname();
  if (pathname?.startsWith("/embed")) return null;
  const roleItem: [string, string] | null =
    role === "admin" || role === "super_admin" ? ["/admin", "ADMIN"] : role === "organiser" ? ["/organiser", "ORGANISER"] : null;
  const items = roleItem ? [...ITEMS, roleItem] : ITEMS;

  return (
    <div style={{ borderBottom: "1px solid #E4E2DD" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "18px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <Link href="/" className="disp site-title" style={{ letterSpacing: "0.02em", color: "#111111", whiteSpace: "nowrap", flexShrink: 0 }}>
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
                  color: active ? "#111111" : "#6B6B66",
                  padding: "8px 14px",
                  borderBottom: `2px solid ${active ? "#E0102A" : "transparent"}`,
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
