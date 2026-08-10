export default function RouteLine({ color = "#E0102A", height = 46 }: { color?: string; height?: number }) {
  return (
    <svg viewBox="0 0 1200 60" preserveAspectRatio="none" style={{ width: "100%", height, display: "block" }}>
      <path
        d="M0 46 L90 30 L170 42 L260 14 L360 36 L470 8 L560 32 L660 20 L760 44 L860 18 L960 34 L1060 12 L1200 30"
        stroke={color}
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
