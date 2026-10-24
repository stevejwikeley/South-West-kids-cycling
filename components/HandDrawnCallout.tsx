// Pen-on-paper emphasis for the calendar's main call to action: a scribbled
// loop around the button, a few burst dashes off its corner, and a
// handwritten note with an arrow pointing back at it. Every mark is
// decorative (aria-hidden) — the button inside carries its own label.
//
// The note sits to the right of the button when there's room and wraps
// underneath on a phone; its arrow curves up and to the left, so it points
// at the button from either spot.
export default function HandDrawnCallout({ note, children }: { note: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", columnGap: 26, rowGap: 10, padding: "16px 0 8px 18px" }}>
      <div style={{ position: "relative", display: "inline-block" }}>
        {children}
        <svg
          aria-hidden
          viewBox="0 0 300 80"
          preserveAspectRatio="none"
          style={{ position: "absolute", top: -17, left: -20, width: "calc(100% + 42px)", height: "calc(100% + 34px)", overflow: "visible", pointerEvents: "none" }}
        >
          {/* One continuous stroke that overshoots its own start, the way a
              loop drawn in one go does. */}
          <path
            className="scribble-draw"
            pathLength={1}
            d="M 46 9 C 120 1, 248 0, 290 22 C 304 34, 296 62, 240 74 C 170 84, 70 82, 22 70 C -2 62, 2 30, 30 16 C 70 2, 170 2, 246 8"
            fill="none"
            stroke="#111111"
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <svg aria-hidden viewBox="0 0 30 30" width={28} height={28} style={{ position: "absolute", top: -34, right: -34, overflow: "visible", pointerEvents: "none" }}>
          <g stroke="#E0102A" strokeWidth={2.6} strokeLinecap="round" fill="none">
            <path className="scribble-draw-late" pathLength={1} d="M 6 20 L 3 7" />
            <path className="scribble-draw-late" pathLength={1} d="M 11 23 L 21 11" />
            <path className="scribble-draw-late" pathLength={1} d="M 14 28 L 27 25" />
          </g>
        </svg>
      </div>

      <div aria-hidden style={{ display: "flex", alignItems: "flex-start", gap: 4, transform: "rotate(-3deg)" }}>
        <svg viewBox="0 0 46 34" width={42} height={31} style={{ flexShrink: 0, overflow: "visible", marginTop: -6 }}>
          <path className="scribble-draw-late" pathLength={1} d="M 42 30 C 34 10, 20 4, 5 9" fill="none" stroke="#111111" strokeWidth={2.2} strokeLinecap="round" />
          <path className="scribble-draw-late" pathLength={1} d="M 13 3 L 5 9 L 13 15" fill="none" stroke="#111111" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span style={{ fontFamily: "var(--font-caveat), cursive", fontWeight: 600, fontSize: 23, lineHeight: 1.05, color: "#111111", maxWidth: 170 }}>{note}</span>
      </div>
    </div>
  );
}
