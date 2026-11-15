// A barely-visible star chart behind the whole landing page:
// the constellations Homer's sailors steered by, and Odysseus's route home,
// which draws itself (stop by stop) as you scroll down.
import { motion, useScroll, useTransform, type MotionValue } from "motion/react";

type Point = { x: number; y: number };
type Stop = Point & { name: string };

// The voyage, Troy -> Ithaca (positions on a 1440 x 900 chart)
const STOPS: Stop[] = [
  { name: "Troy", x: 110, y: 790 },
  { name: "Cicones", x: 250, y: 660 },
  { name: "Lotus-eaters", x: 420, y: 745 },
  { name: "Cyclops", x: 560, y: 585 },
  { name: "Aeolus", x: 705, y: 445 },
  { name: "Circe", x: 880, y: 525 },
  { name: "Sirens", x: 1010, y: 375 },
  { name: "Scylla", x: 1150, y: 455 },
  { name: "Calypso", x: 1250, y: 265 },
  { name: "Ithaca", x: 1350, y: 120 },
];

// A smooth curve through all the stops (Catmull-Rom spline turned into SVG curves)
function smoothPath(points: Point[]) {
  let d = `M${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += ` C${c1.x} ${c1.y} ${c2.x} ${c2.y} ${p2.x} ${p2.y}`;
  }
  return d;
}
const ROUTE = smoothPath(STOPS);

// Constellations: star positions and which stars are joined by lines
const CONSTELLATIONS = [
  {
    name: "The Bear", // Calypso told Odysseus to keep the Bear on his left
    label: { x: 150, y: 250 },
    stars: [
      [110, 120], [165, 104], [216, 118], [262, 140], [272, 200], [342, 212], [352, 150],
    ],
    lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 3]],
  },
  {
    name: "Orion",
    label: { x: 1150, y: 330 },
    stars: [
      [1150, 112], [1262, 100], [1180, 192], [1210, 182], [1240, 172], [1160, 282], [1272, 262],
    ],
    lines: [[0, 2], [1, 4], [2, 3], [3, 4], [2, 5], [4, 6]],
  },
];
const PLEIADES = [
  [740, 92], [756, 84], [770, 96], [752, 104], [765, 112], [781, 86], [745, 116],
];

// One stop on the route: fades in when the route reaches it
function RouteStop({ stop, at, progress }: { stop: Stop; at: number; progress: MotionValue<number> }) {
  const opacity = useTransform(progress, [at - 0.05, at], [0, 1]);
  return (
    <motion.g style={{ opacity }}>
      <circle cx={stop.x} cy={stop.y} r={5} stroke="#c9a96a" strokeWidth={1.4} fill="none" />
      <circle cx={stop.x} cy={stop.y} r={1.8} fill="#c9a96a" />
      <text x={stop.x + 12} y={stop.y - 10} className="voyage-label">
        {stop.name}
      </text>
    </motion.g>
  );
}

export default function VoyageChart() {
  const { scrollYProgress } = useScroll(); // how far down the whole page you are (0..1)
  const reveal = useTransform(scrollYProgress, [0.03, 0.9], [0, 1]);
  const drift = useTransform(scrollYProgress, [0, 1], [0, -50]); // slow parallax

  return (
    <motion.svg
      className="voyage-chart"
      viewBox="0 0 1440 900"
      preserveAspectRatio="xMidYMid slice"
      style={{ y: drift }}
      aria-hidden
    >
      <defs>
        {/* the dotted route only shows where this (growing) line has reached */}
        <mask id="route-reveal" maskUnits="userSpaceOnUse" x="0" y="0" width="1440" height="900">
          <motion.path d={ROUTE} fill="none" stroke="white" strokeWidth={14} style={{ pathLength: reveal }} />
        </mask>
      </defs>

      {/* constellations */}
      {CONSTELLATIONS.map((c) => (
        <g key={c.name}>
          {c.lines.map(([a, b]) => (
            <line
              key={`${a}-${b}`}
              x1={c.stars[a][0]}
              y1={c.stars[a][1]}
              x2={c.stars[b][0]}
              y2={c.stars[b][1]}
              stroke="#c9a96a"
              strokeWidth={1}
            />
          ))}
          {c.stars.map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={2.6} fill="#f1e6cd" />
          ))}
          <text x={c.label.x} y={c.label.y} className="voyage-label">
            {c.name}
          </text>
        </g>
      ))}
      {PLEIADES.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={1.8} fill="#f1e6cd" />
      ))}
      <text x={732} y={146} className="voyage-label">
        Pleiades
      </text>

      {/* the route home */}
      <path
        d={ROUTE}
        fill="none"
        stroke="#c9a96a"
        strokeWidth={2}
        strokeDasharray="2 10"
        strokeLinecap="round"
        mask="url(#route-reveal)"
      />
      {STOPS.map((s, i) => (
        <RouteStop key={s.name} stop={s} at={i / (STOPS.length - 1)} progress={reveal} />
      ))}
    </motion.svg>
  );
}
