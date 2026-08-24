"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { trackEvent } from "@/lib/analytics";

export const OPEN_FEEDBACK_EVENT = "swkc:open-feedback";

const DISMISSED_KEY = "swkc_beta_banner_dismissed";
const HIDDEN_PREFIXES = ["/admin", "/organiser", "/login", "/auth", "/oauth"];

export default function BetaBanner() {
  const pathname = usePathname();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setDismissed(!!window.localStorage.getItem(DISMISSED_KEY));
  }, []);

  const hidden = HIDDEN_PREFIXES.some((p) => pathname?.startsWith(p)) || pathname === "/embed" || !!pathname?.startsWith("/embed/");
  if (hidden || dismissed) return null;

  return (
    <div style={{ background: "#FFF4D6", borderBottom: "1px solid #E8D9A8", padding: "10px 40px", textAlign: "center", position: "relative" }}>
      <span className="mono" style={{ fontSize: 12, letterSpacing: "0.02em", color: "#4A4A46" }}>
        CURRENTLY IN BETA — FIRST LAUNCHED AUGUST 2026 —{" "}
        <button
          type="button"
          onClick={() => {
            trackEvent("beta_banner_feedback_click");
            window.dispatchEvent(new Event(OPEN_FEEDBACK_EVENT));
          }}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            color: "#111111",
            fontWeight: 700,
            textDecoration: "underline",
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: "inherit",
            letterSpacing: "inherit",
          }}
        >
          REQUEST FEEDBACK
        </button>
      </span>
      <button
        type="button"
        onClick={() => {
          window.localStorage.setItem(DISMISSED_KEY, "1");
          setDismissed(true);
        }}
        aria-label="Dismiss banner"
        style={{
          position: "absolute",
          right: 12,
          top: "50%",
          transform: "translateY(-50%)",
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "#6B6B66",
          display: "flex",
          padding: 4,
        }}
      >
        <X size={14} />
      </button>
    </div>
  );
}
