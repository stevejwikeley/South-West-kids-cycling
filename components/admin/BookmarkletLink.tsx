"use client";

import { useEffect, useRef } from "react";

// Cloudflare-protected sites (British Cycling, etc.) block server-side
// fetches, but a real signed-in browser gets through fine — this bookmarklet
// just captures what's already visible on the page you're looking at and
// hands it to the ingest form, same as copy/pasting by hand but one click.
const BOOKMARKLET = `javascript:(function(){try{var m=document.querySelector('main')||document.body;var t=(document.title+'\\n\\n'+m.innerText).trim().slice(0,3000);location.href='https://www.southwestkidscycling.uk/admin/ingest?prefill='+encodeURIComponent(t);}catch(e){alert('SWKC bookmarklet error: '+e.message);}})();`;

export default function BookmarkletLink() {
  // React 19 sanitizes any href starting with "javascript:" set via JSX
  // (silently rewrites it to one that just throws — no visible error, so a
  // dragged bookmark "does nothing" when clicked). Setting it on the raw DOM
  // node after mount bypasses that. href is deliberately absent from the JSX
  // below so React never touches or resets this attribute on a re-render.
  const linkRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    linkRef.current?.setAttribute("href", BOOKMARKLET);
  }, []);

  return (
    <div style={{ marginTop: 40, maxWidth: 560, padding: "16px 18px", background: "#F3F2EE", border: "1px solid #E4E2DD" }}>
      <h3 className="mono" style={{ fontSize: 11, letterSpacing: "0.08em", color: "#6B6B66", marginBottom: 8 }}>
        BROWSER BOOKMARKLET
      </h3>
      <p style={{ fontSize: 13, lineHeight: 1.6, color: "#4A4A46", marginBottom: 10 }}>
        Some sites (British Cycling, etc.) block automated fetching, so pasting their URL above won&apos;t work. Drag this into your bookmarks bar — on any event page, click it to jump to this ingest form pre-filled with that page&apos;s text. If you dragged an earlier version, delete it and drag this one again — editing this page doesn&apos;t update a bookmark you already saved.
      </p>
      <a
        ref={linkRef}
        onClick={(e) => e.preventDefault()}
        className="mono"
        style={{ display: "inline-block", background: "#111111", color: "#FAFAF8", padding: "9px 16px", fontSize: 12.5, fontWeight: 700, cursor: "grab" }}
      >
        Send to SWKC
      </a>
      <p className="mono" style={{ fontSize: 10.5, color: "#9A9992", marginTop: 8 }}>
        Drag, don&apos;t click — clicking here does nothing since it needs to run on the page you want to capture.
      </p>
    </div>
  );
}
