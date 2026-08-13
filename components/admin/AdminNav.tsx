"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function AdminNav({ pendingCount }: { pendingCount: number }) {
  const pathname = usePathname();

  const items: [string, string][] = [
    ["/admin", "DASHBOARD"],
    ["/admin/pending", `PENDING QUEUE${pendingCount > 0 ? ` (${pendingCount})` : ""}`],
    ["/admin/ingest", "ADD EVENTS"],
    ["/admin/sources", "WATCHED SOURCES"],
  ];

  return (
    <div style={{ borderBottom: "1px solid #E4E2DD", background: "#F3F2EE" }}>
      <div className="mono" style={{ maxWidth: 1100, margin: "0 auto", padding: "12px 24px", display: "flex", gap: 22, flexWrap: "wrap", fontSize: 11, letterSpacing: "0.03em" }}>
        {items.map(([href, label]) => {
          const active = href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              style={{
                paddingBottom: 2,
                fontWeight: 700,
                color: active ? "#111111" : "#6B6B66",
                borderBottom: active ? "2px solid #E0102A" : "2px solid transparent",
              }}
            >
              {label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
