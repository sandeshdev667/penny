// A sack of gold for the landing page's closing quote: coins drop in (spinning as they fall)
// and a little pile beside it glints.
import { motion } from "motion/react";

const COIN = "#ecd29c";
const COIN_EDGE = "#b5843d";
const NAVY = "#0d1626";

// Little four-pointed sparkles on the coin pile
const GLINTS = [
  { x: 150, y: 168, delay: 0 },
  { x: 171, y: 178, delay: 1.1 },
  { x: 138, y: 181, delay: 2.2 },
];

function Sparkle({ x, y, delay }: { x: number; y: number; delay: number }) {
  return (
    <motion.path
      d={`M${x} ${y - 6} L${x + 1.4} ${y - 1.4} L${x + 6} ${y} L${x + 1.4} ${y + 1.4} L${x} ${y + 6} L${x - 1.4} ${y + 1.4} L${x - 6} ${y} L${x - 1.4} ${y - 1.4} Z`}
      fill="#fff6dc"
      initial={{ opacity: 0, scale: 0.3 }}
      animate={{ opacity: [0, 1, 0], scale: [0.3, 1, 0.3] }}
      transition={{ duration: 1.6, repeat: Infinity, repeatDelay: 2.2, delay, ease: "easeInOut" }}
      style={{ transformOrigin: `${x}px ${y}px` }}
    />
  );
}

export default function GoldSack({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 200 200" fill="none" aria-hidden>
      {/* shadow on the ground */}
      <ellipse cx="104" cy="184" rx="80" ry="9" fill="rgba(201, 169, 106, 0.12)" />

      {/* coins falling into the open sack, spinning (rx shrinks and grows) */}
      {[0, 1, 2].map((i) => (
        <motion.ellipse
          key={i}
          cx={93 + i * 7}
          ry={6}
          fill={COIN}
          stroke={COIN_EDGE}
          strokeWidth={1.2}
          initial={{ cy: -12, rx: 6, opacity: 0 }}
          animate={{ cy: [-12, 66], rx: [6, 1.4, 6, 1.4, 6], opacity: [0, 1, 1, 0] }}
          transition={{ duration: 1.3, repeat: Infinity, repeatDelay: 2, delay: i * 1.1, ease: "easeIn" }}
        />
      ))}

      {/* sack body */}
      <path d="M66 98 C42 114 34 150 49 172 C61 189 139 189 151 172 C166 150 158 114 134 98 Z" fill="#b5843d" />
      <path
        d="M78 104 C70 124 68 150 74 176 M100 103 C98 130 99 156 102 182 M122 104 C130 124 132 150 127 176"
        stroke={NAVY}
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity="0.45"
      />
      {/* gathered neck, flaring open at the top */}
      <path d="M72 100 C69 88 72 79 77 72 L123 72 C128 79 131 88 128 100 Z" fill="#c4954a" />
      <path d="M84 74 C82 82 82 90 84 98 M100 74 L100 98 M116 74 C118 82 118 90 116 98" stroke={NAVY} strokeWidth="1.1" opacity="0.4" />
      {/* the open mouth, full of coins */}
      <ellipse cx="100" cy="71" rx="25" ry="7.5" fill="#3a2810" />
      <ellipse cx="91" cy="69.6" rx="6" ry="2.6" fill={COIN} />
      <ellipse cx="102" cy="68.8" rx="6" ry="2.6" fill={COIN} />
      <ellipse cx="111" cy="70.4" rx="5" ry="2.2" fill={COIN} />
      {/* rope tie and knot */}
      <path d="M69 97 C86 103 114 103 131 97" stroke={COIN} strokeWidth="4.5" strokeLinecap="round" />
      <path d="M100 102 C97 112 92 120 87 126 M100 102 C104 111 110 117 117 121" stroke={COIN} strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="100" cy="102" r="3.6" fill={COIN} />
      {/* a Greek key band stamped on the sack */}
      <path
        d="M62 148 H70 V140 H78 V148 H86 V140 H94 V148 H102 V140 H110 V148 H118 V140 H126 V148 H134 V140 H140"
        stroke={COIN}
        strokeWidth="2"
        strokeLinejoin="miter"
        opacity="0.75"
      />

      {/* the pile of spilled coins */}
      <ellipse cx="160" cy="181" rx="13" ry="4.6" fill={COIN} stroke={COIN_EDGE} strokeWidth="1.2" />
      <ellipse cx="160" cy="177" rx="13" ry="4.6" fill={COIN} stroke={COIN_EDGE} strokeWidth="1.2" />
      <ellipse cx="160" cy="173" rx="13" ry="4.6" fill={COIN} stroke={COIN_EDGE} strokeWidth="1.2" />
      <ellipse cx="141" cy="183" rx="11" ry="4" fill={COIN} stroke={COIN_EDGE} strokeWidth="1.2" />
      <ellipse cx="178" cy="184" rx="9" ry="3.4" fill={COIN} stroke={COIN_EDGE} strokeWidth="1.2" />
      <circle cx="183" cy="172" r="6.5" fill={COIN} stroke={COIN_EDGE} strokeWidth="1.2" />
      <circle cx="183" cy="172" r="3.6" stroke={COIN_EDGE} strokeWidth="1" />
      {GLINTS.map((g) => (
        <Sparkle key={g.x} {...g} />
      ))}
    </svg>
  );
}
