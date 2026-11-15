// Penny's own line icons (hand-drawn SVG, so they match each other and take the text color)

type IconProps = { size?: number; className?: string };

// Shared wrapper: 24x24 grid, 1.6px lines, color comes from CSS (currentColor)
function Line({ size = 24, className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  );
}

// Dashboard: a temple (the treasury)
export function TempleIcon(p: IconProps) {
  return (
    <Line {...p}>
      <path d="M3 9 12 4l9 5Z" />
      <path d="M4.5 9.5h15M6.5 12v6M10 12v6M14 12v6M17.5 12v6M4.5 19.5h15M3 21.5h18" />
    </Line>
  );
}

// Scan: a Greek ship with a square sail
export function ShipIcon(p: IconProps) {
  return (
    <Line {...p}>
      <path d="M2.5 14.5h16.5l2.5-3q.5 6-4.5 7.5H7.5Q3.5 18.5 2.5 14.5Z" />
      <path d="M11 14.5V3.5M6.5 5h9q.8 4 0 7.5h-9q-.8-3.5 0-7.5Z" />
      <path d="M7 19 5.5 21.5M10.5 19 9 21.5M14 19l-1.5 2.5" />
    </Line>
  );
}

// Ask Athena: her owl
export function OwlIcon(p: IconProps) {
  return (
    <Line {...p}>
      <path d="M6 3.5 9 6.5q3-1 6 0l3-3v8.5q0 7-6 9-6-2-6-9Z" />
      <circle cx="9.6" cy="11" r="1.9" />
      <circle cx="14.4" cy="11" r="1.9" />
      <path d="m12 13.3-.9 1.5h1.8ZM9.5 17.5q2.5 1.5 5 0" />
    </Line>
  );
}

// Ask Athena: a Roman-style profile with a bun (same shapes as athena-mark.svg, drawn as lines)
export function CameoIcon({ size = 24, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="9 9 42 42"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinejoin="round"
      strokeLinecap="round"
      className={className}
      aria-hidden
    >
      <path d="M37 16.5 C39.6 17.8 40.9 20.6 41 23.6 C41.4 24.6 42.6 26.6 43.9 28.6 C44.6 29.6 45.4 30.4 45.3 31 C45.1 31.7 44.2 31.9 43.4 31.9 L43.3 33.1 C44 33.4 44.1 34 43.4 34.3 C43.8 34.9 43.7 35.8 42.8 36.1 C42.5 37.3 42.9 38.7 41.8 40 C40.4 41.6 37.6 42.3 34.6 42.2 C35 45.4 35.8 48.6 37.2 50.5" />
      <path d="M37.6 16.2 C35.8 12.4 30.6 10.6 25.6 11.6 C19.4 12.8 15.6 17.8 15.8 24.2 C16 29.4 18.6 33.6 22.6 36.2 C25 37.8 27.2 38.6 28.8 40.2 L30.8 36.4 C30.2 32.4 31 28.6 33.4 25.8 C35 24 36.6 21.8 38.4 19.4 C38.6 18.2 38.3 17 37.6 16.2 Z" />
      <path d="M27.6 41 C27.8 44.5 27.2 47.5 26.2 50.5" />
      <circle cx="18.6" cy="33.6" r="4.6" />
    </svg>
  );
}

// Your dashboard / the destination: an island with a flag
export function IslandIcon(p: IconProps) {
  return (
    <Line {...p}>
      <path d="m3 17 6-8 3 3 2.5-2.5L21 17M9 9V3.5l4 1.6L9 6.7" />
      <path d="M2 20.5q2.5-1.6 5 0t5 0 5 0 5 0" />
    </Line>
  );
}

// Recurring charges: a coin going round and round
export function RepeatIcon(p: IconProps) {
  return (
    <Line {...p}>
      <path d="M19.5 12a7.5 7.5 0 0 1-13 5.1M4.5 12a7.5 7.5 0 0 1 13-5.1" />
      <path d="M17.8 3.2v3.7h-3.7M6.2 20.8v-3.7h3.7" />
      <circle cx="12" cy="12" r="2.4" />
    </Line>
  );
}

// A scroll / receipt (used for "saved to the ledger")
export function ScrollIcon(p: IconProps) {
  return (
    <Line {...p}>
      <path d="M7 4h11a2 2 0 0 1 0 4h-1v10a2 2 0 0 1-2 2H6a2 2 0 0 1 0-4h1Z" />
      <path d="M7 16V4M10 8.5h4M10 11.5h4" />
    </Line>
  );
}

export function PlusIcon(p: IconProps) {
  return (
    <Line {...p}>
      <path d="M12 5v14M5 12h14" />
    </Line>
  );
}

export function SendIcon(p: IconProps) {
  return (
    <Line {...p}>
      <path d="M12 19V5M6 11l6-6 6 6" />
    </Line>
  );
}

export function CheckIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M3 8.5l3 3 7-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function WarnIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M8 2.5l6 11H2l6-11z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M8 6.5v3.2M8 11.6v.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function ArrowIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M2 8h11M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
