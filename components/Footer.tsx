"use client";

import Link from "next/link";
import { trackEvent } from "@/lib/analytics";

export default function Footer() {
  return (
    <footer style={{ borderTop: "1px solid #E4E2DD", marginTop: 40 }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 24px", display: "flex", gap: 24, flexWrap: "wrap", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div className="mono" style={{ fontSize: 10.5, color: "#6B6B66" }}>SOUTH WEST KIDS CYCLING — DEVON &amp; CORNWALL</div>
          <Link href="/about" onClick={() => trackEvent("footer_about_click")} className="mono" style={{ fontSize: 10.5, color: "#6B6B66", textDecoration: "underline", display: "inline-block", marginTop: 4 }}>
            Made by Steve Wikeley
          </Link>
        </div>
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
          <Link href="/submit-event" onClick={() => trackEvent("footer_submit_event_click")} className="mono" style={{ fontSize: 11, color: "#6B6B66", textDecoration: "underline" }}>
            Event missing? Submit an event
          </Link>
          <Link href="/contact?reason=organiser" onClick={() => trackEvent("footer_organiser_request_click")} className="mono" style={{ fontSize: 11, color: "#6B6B66", textDecoration: "underline" }}>
            Are you an event organiser? Request an account
          </Link>
          <Link href="/contact" onClick={() => trackEvent("footer_contact_click")} className="mono" style={{ fontSize: 11, color: "#6B6B66", textDecoration: "underline" }}>
            Contact us
          </Link>
        </div>
      </div>
    </footer>
  );
}
