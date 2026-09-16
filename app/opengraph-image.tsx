import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          background: "#FAFAF8",
          padding: "80px 90px",
        }}
      >
        <div
          style={{
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: 2,
            color: "#E0102A",
            marginBottom: 28,
          }}
        >
          DEVON, CORNWALL &amp; SOMERSET — AGES 5 TO 16
        </div>
        <div
          style={{
            fontSize: 76,
            fontWeight: 900,
            color: "#111111",
            lineHeight: 1.05,
            letterSpacing: -1,
            marginBottom: 32,
          }}
        >
          South West Kids Cycling
        </div>
        <div
          style={{
            fontSize: 30,
            color: "#4A4A46",
            maxWidth: 880,
            lineHeight: 1.4,
          }}
        >
          One calendar for all youth cycling races and events — XC, cyclocross, road, triathlon and club sessions.
        </div>
        <svg
          viewBox="0 0 1200 60"
          width="1020"
          height="46"
          style={{ marginTop: 56 }}
        >
          <path
            d="M0 46 L90 30 L170 42 L260 14 L360 36 L470 8 L560 32 L660 20 L760 44 L860 18 L960 34 L1060 12 L1200 30"
            stroke="#E0102A"
            strokeWidth="4"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    ),
    size
  );
}
