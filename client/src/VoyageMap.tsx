// The Voyage: a night-sea scene of your spending.
// The ship sails a route through your five finished moons (months), each an island named for a stop
// in the Odyssey, and ends at "home" = the end of the current moon. How far the ship has sailed
// shows how far into this moon you are. Provisions (a monthly budget) are a row of amphorae that
// empty as you spend; overspend and a storm breaks over the ship.

import { useEffect, useMemo, useRef, useState } from "react";
import { animate, motion } from "motion/react";
import { EASE } from "./anim";
import { usd } from "./format";
import { useLang } from "./lang";
import shipImg from "./assets/ship.png";

type Monthly = { month: string; total: number };

const PROVISIONS_KEY = "penny.provisions";
function loadProvisions(): number | null {
  try {
    const v = Number(localStorage.getItem(PROVISIONS_KEY));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

const moonName = (key: string) => new Date(key + "-01T00:00").toLocaleDateString("en-US", { month: "short" });
const moonLong = (key: string) => new Date(key + "-01T00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" });
const compact = (n: number) => (n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${Math.round(n)}`);

// The six moons ending with the current one (0 for moons without spending)
function lastSixMoons(monthly: Monthly[], thisMonth: string) {
  const [y, m] = thisMonth.split("-").map(Number);
  const out: Monthly[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(y, m - 1 - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    out.push({ month: key, total: Math.max(0, monthly.find((x) => x.month === key)?.total ?? 0) });
  }
  return out;
}

// Stops along the way, in the order Odysseus met them
const STOPS = ["Land of the Cicones", "Isle of the Lotus-Eaters", "Cave of the Cyclops", "Aeolia", "Circe's Isle"];

// Where each island sits (x along the route, y on the waterline). The last spot is home.
const SPOTS = [
  { x: 105, y: 292 },
  { x: 262, y: 322 },
  { x: 420, y: 286 },
  { x: 578, y: 324 },
  { x: 736, y: 288 },
  { x: 900, y: 318 },
];

function routePath() {
  let d = `M-30 ${SPOTS[0].y + 14} L${SPOTS[0].x} ${SPOTS[0].y + 14}`;
  for (let i = 0; i < SPOTS.length - 1; i++) {
    const a = SPOTS[i];
    const b = SPOTS[i + 1];
    const mid = (a.x + b.x) / 2;
    d += ` C${mid} ${a.y + 14} ${mid} ${b.y + 14} ${b.x} ${b.y + 14}`;
  }
  return d;
}
const ROUTE = routePath();

// A fixed scatter of stars, so they don't jump around on re-render
const STARS = Array.from({ length: 34 }, (_, i) => ({
  x: (i * 197) % 1000,
  y: 14 + ((i * 89) % 150),
  r: i % 5 === 0 ? 1.7 : 1,
  d: (i % 7) * 0.6,
}));
const RAIN = Array.from({ length: 46 }, (_, i) => ({ x: (i * 79) % 1000, delay: (i % 9) * 0.12, len: 14 + (i % 4) * 5 }));

// One amphora (storage jar). `fill` is 0..1: how full it still is.
function Amphora({ fill, over, id }: { fill: number; over: boolean; id: string }) {
  const body = "M9 4 H15 V9 C21 11 22 17 21 24 C20 31 16 34 12 34 C8 34 4 31 3 24 C2 17 3 11 9 9 Z";
  return (
    <svg viewBox="0 0 24 38" className="amphora" aria-hidden>
      <defs>
        <clipPath id={`amph-${id}`}>
          <rect x="0" y={38 - 38 * fill} width="24" height={38 * fill} />
        </clipPath>
      </defs>
      <path d={body} fill="rgba(23,25,31,0.07)" stroke={over ? "#a8452a" : "#8a5a1f"} strokeWidth="1.4" strokeLinejoin="round" />
      <path d={body} fill={over ? "#a8452a" : "#c98a2c"} clipPath={`url(#amph-${id})`} />
      <path d="M9 5 C4 5 3 10 6 11 M15 5 C20 5 21 10 18 11" fill="none" stroke={over ? "#a8452a" : "#8a5a1f"} strokeWidth="1.3" strokeLinecap="round" />
      <path d="M5 20 H19" stroke="#fbf8f1" strokeWidth="0.8" opacity="0.5" />
    </svg>
  );
}

type Props = {
  monthly: Monthly[];
  thisMonth: string;
  spentSoFar: number; // this moon so far
  pace: number; // what this moon will cost at the current rate
  dayOfMonth: number;
  daysInMonth: number;
};

export default function VoyageMap({ monthly, thisMonth, spentSoFar, pace, dayOfMonth, daysInMonth }: Props) {
  const { t, ancient } = useLang();
  const moons = useMemo(() => lastSixMoons(monthly, thisMonth), [monthly, thisMonth]);
  const finishedMoons = moons.slice(0, 5);

  // Provisions = monthly budget. Starts as your usual month; you can change it.
  const usual = finishedMoons.filter((m) => m.total > 0);
  const autoProvisions = usual.length ? Math.round(usual.reduce((s, m) => s + m.total, 0) / usual.length / 50) * 50 : 2000;
  const [custom, setCustom] = useState<number | null>(loadProvisions);
  const provisions = custom ?? autoProvisions;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  function saveProvisions(value: number | null) {
    setCustom(value);
    try {
      if (value === null) localStorage.removeItem(PROVISIONS_KEY);
      else localStorage.setItem(PROVISIONS_KEY, String(value));
    } catch {
      // storage blocked: it still works for this visit
    }
  }

  const left = provisions - spentSoFar;
  const stormy = pace > provisions;
  const over = Math.max(0, pace - provisions);
  const remainingShare = provisions > 0 ? Math.max(0, left) / provisions : 0;
  const biggest = Math.max(provisions, ...moons.map((m) => m.total), 1);

  // ---------- The ship sails along the route (positions are measured from the real SVG path) ----------
  const pathRef = useRef<SVGPathElement>(null);
  const [ship, setShip] = useState<{ x: number; y: number; angle: number } | null>(null);
  const [trail, setTrail] = useState(0); // 0..1: how much of the route is already sailed
  const dayShare = Math.min(1, Math.max(0, dayOfMonth / daysInMonth));
  const targetX = SPOTS[4].x + (SPOTS[5].x - SPOTS[4].x) * dayShare; // between the 5th island and home

  useEffect(() => {
    const path = pathRef.current;
    if (!path) return;
    const total = path.getTotalLength();
    // find how far along the path the ship should be (the route moves steadily to the right, so bisect on x)
    let lo = 0;
    let hi = total;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (path.getPointAtLength(mid).x < targetX) lo = mid;
      else hi = mid;
    }
    const target = lo;
    const at = (l: number) => {
      const p = path.getPointAtLength(l);
      const q = path.getPointAtLength(Math.min(total, l + 3));
      return { x: p.x, y: p.y, angle: (Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI };
    };
    // sail in from the start of the route
    const controls = animate(0, target, {
      duration: 3.2,
      ease: [0.3, 0.1, 0.3, 1],
      onUpdate: (l) => {
        setShip(at(l));
        setTrail(l / total);
      },
    });
    return () => controls.stop();
  }, [targetX]);

  // which island's tally is showing (default: home, the end of this moon)
  const [pickedIndex, setPicked] = useState<number | null>(null);
  const picked = pickedIndex ?? 5;
  const choice = moons[picked];
  const choiceTotal = picked === 5 ? pace : choice.total;
  const choiceDiff = choiceTotal - provisions;

  return (
    <section className="card voyage">
      <div className="card-head">
        <h2>{t("voyTitle")}</h2>
        <span className="card-note">{t("voyNote")}</span>
      </div>

      <div className="voyage-stage">
        <svg viewBox="0 0 1000 400" className="voyage-svg" role="img" aria-label="Your last six months as islands on a sea route">
          <defs>
            <linearGradient id="sky-calm" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#0b1830" />
              <stop offset="0.7" stopColor="#1d3358" />
              <stop offset="1" stopColor="#27456f" />
            </linearGradient>
            <linearGradient id="sky-storm" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#0b0d17" />
              <stop offset="0.7" stopColor="#1c2033" />
              <stop offset="1" stopColor="#2a3047" />
            </linearGradient>
            <linearGradient id="sea-calm" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#1d3a63" />
              <stop offset="1" stopColor="#0a1830" />
            </linearGradient>
            <linearGradient id="sea-storm" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#202a40" />
              <stop offset="1" stopColor="#090c16" />
            </linearGradient>
            <radialGradient id="moon-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0" stopColor="#fff3cf" stopOpacity="0.5" />
              <stop offset="1" stopColor="#fff3cf" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* sky and sea */}
          <rect width="1000" height="400" fill={stormy ? "url(#sky-storm)" : "url(#sky-calm)"} />
          <rect y="262" width="1000" height="138" fill={stormy ? "url(#sea-storm)" : "url(#sea-calm)"} />

          {/* calm: stars and a moon with a glow */}
          {!stormy && (
            <g>
              {STARS.map((s, i) => (
                <motion.circle
                  key={i}
                  cx={s.x}
                  cy={s.y}
                  r={s.r}
                  fill="#f4ead2"
                  animate={{ opacity: [0.2, 0.9, 0.2] }}
                  transition={{ duration: 3.4, repeat: Infinity, delay: s.d }}
                />
              ))}
              <circle cx="860" cy="78" r="70" fill="url(#moon-glow)" />
              <circle cx="860" cy="78" r="24" fill="#f3e6bd" />
              <circle cx="852" cy="72" r="24" fill="#f3e6bd" />
              <circle cx="868" cy="86" r="4" fill="#d9c694" opacity="0.6" />
            </g>
          )}

          {/* storm: clouds, rain and lightning */}
          {stormy && (
            <g>
              {[
                { x: 160, y: 62, s: 1.1, d: 0 },
                { x: 520, y: 40, s: 1.35, d: 1.5 },
                { x: 840, y: 70, s: 1.05, d: 0.8 },
              ].map((c, i) => (
                <motion.g
                  key={i}
                  animate={{ x: [0, 30, 0] }}
                  transition={{ duration: 9 + i * 2, repeat: Infinity, ease: "easeInOut", delay: c.d }}
                >
                  <ellipse cx={c.x} cy={c.y} rx={110 * c.s} ry={26 * c.s} fill="#151827" />
                  <ellipse cx={c.x + 60 * c.s} cy={c.y - 14 * c.s} rx={70 * c.s} ry={24 * c.s} fill="#1d2135" />
                  <ellipse cx={c.x - 64 * c.s} cy={c.y - 8 * c.s} rx={60 * c.s} ry={22 * c.s} fill="#1d2135" />
                </motion.g>
              ))}
              {RAIN.map((r, i) => (
                <motion.line
                  key={i}
                  x1={r.x}
                  x2={r.x - 8}
                  y1={0}
                  y2={r.len}
                  stroke="#9fb4d6"
                  strokeWidth="1"
                  strokeLinecap="round"
                  initial={{ y: 90, opacity: 0 }}
                  animate={{ y: 300, opacity: [0, 0.5, 0] }}
                  transition={{ duration: 0.9, repeat: Infinity, delay: r.delay, ease: "linear" }}
                />
              ))}
              <motion.path
                d="M648 74 L624 140 L642 140 L616 214"
                stroke="#fff3c4"
                strokeWidth="3"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                animate={{ opacity: [0, 0, 1, 0.2, 0.9, 0] }}
                transition={{ duration: 3.6, repeat: Infinity, times: [0, 0.55, 0.6, 0.68, 0.74, 1] }}
              />
              <motion.rect
                width="1000"
                height="400"
                fill="#dfe8ff"
                animate={{ opacity: [0, 0, 0.22, 0, 0.1, 0] }}
                transition={{ duration: 3.6, repeat: Infinity, times: [0, 0.55, 0.6, 0.68, 0.74, 1] }}
                style={{ pointerEvents: "none" }}
              />
            </g>
          )}

          {/* waves */}
          {[0, 1, 2].map((row) => (
            <motion.g
              key={row}
              animate={{ x: [0, row % 2 ? 60 : -60] }}
              transition={{ duration: 7 + row * 2, repeat: Infinity, ease: "linear" }}
              opacity={0.28 - row * 0.05}
            >
              <path
                d={`M-120 ${276 + row * 38} ${Array.from({ length: 24 }, () => `q15 ${stormy ? 10 : 6} 30 0 q15 ${stormy ? -10 : -6} 30 0`).join(" ")}`}
                fill="none"
                stroke="#e9d5aa"
                strokeWidth="1.2"
              />
            </motion.g>
          ))}

          {/* the route: dotted ahead, solid gold behind the ship */}
          <path ref={pathRef} d={ROUTE} fill="none" stroke="#c9a96a" strokeWidth="2" strokeDasharray="3 9" strokeLinecap="round" opacity="0.55" />
          <path d={ROUTE} fill="none" stroke="#e3c27d" strokeWidth="3" strokeLinecap="round" pathLength={1} strokeDasharray={`${trail} 1`} />

          {/* the islands */}
          {SPOTS.map((spot, i) => {
            const isHome = i === 5;
            const m = moons[i];
            const total = isHome ? pace : m.total;
            const isOver = total > provisions;
            const size = 22 + (total / biggest) * 30 + (isHome ? 6 : 0);
            const on = picked === i;
            const hill = isOver ? "#a8452a" : "#6f8a52";
            const hillDark = isOver ? "#7d311d" : "#4f6a3a";
            return (
              <g
                key={m.month}
                className="island"
                onClick={() => setPicked(i)}
                onMouseEnter={() => setPicked(i)}
                onFocus={() => setPicked(i)}
                tabIndex={0}
                role="button"
                aria-label={`${moonLong(m.month)}: ${usd(total)}`}
              >
                <circle cx={spot.x} cy={spot.y - size * 0.4} r={size + 22} fill="transparent" />
                <motion.g
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.15 + i * 0.12, type: "spring", stiffness: 200, damping: 15 }}
                  style={{ transformOrigin: `${spot.x}px ${spot.y}px` }}
                >
                  {on && <ellipse cx={spot.x} cy={spot.y + 2} rx={size * 1.5} ry={8} fill="none" stroke="#f6eedb" strokeWidth="1.5" opacity="0.7" />}
                  {/* land */}
                  <path
                    d={`M${spot.x - size * 1.15} ${spot.y} C${spot.x - size * 0.8} ${spot.y - size * 0.35} ${spot.x - size * 0.5} ${spot.y - size * 0.95} ${spot.x - size * 0.05} ${spot.y - size} C${spot.x + size * 0.35} ${spot.y - size * 1.05} ${spot.x + size * 0.7} ${spot.y - size * 0.4} ${spot.x + size * 1.15} ${spot.y} Z`}
                    fill={hill}
                    stroke={on ? "#f6eedb" : "#08101f"}
                    strokeWidth={on ? 2.2 : 1.2}
                    strokeLinejoin="round"
                  />
                  <path
                    d={`M${spot.x - size * 0.05} ${spot.y - size} C${spot.x + size * 0.35} ${spot.y - size * 1.05} ${spot.x + size * 0.7} ${spot.y - size * 0.4} ${spot.x + size * 1.15} ${spot.y} L${spot.x + size * 0.2} ${spot.y} Z`}
                    fill={hillDark}
                    opacity="0.55"
                  />
                  <path d={`M${spot.x - size * 1.25} ${spot.y + 1} H${spot.x + size * 1.25}`} stroke="#e9d5aa" strokeWidth="3" strokeLinecap="round" opacity="0.55" />
                  {/* a little temple when within provisions; a lightning scar when over */}
                  {!isOver && (
                    <g transform={`translate(${spot.x - size * 0.02} ${spot.y - size * 1.02}) scale(${Math.max(0.7, size / 38)})`}>
                      <path d="M-9 0 L0 -7 L9 0 Z" fill="#f3e6bd" />
                      <path d="M-7 0 V9 M-2.5 0 V9 M2.5 0 V9 M7 0 V9" stroke="#f3e6bd" strokeWidth="1.8" />
                    </g>
                  )}
                  {isOver && (
                    <path
                      d={`M${spot.x + size * 0.15} ${spot.y - size * 1.0} l-6 14 l9 -2 l-8 16`}
                      stroke="#f6d590"
                      strokeWidth="2.2"
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )}
                  {/* home glows like a hearth */}
                  {isHome && <circle cx={spot.x} cy={spot.y - size * 0.55} r={size * 0.9} fill="#f6d590" opacity="0.12" />}
                </motion.g>

                <text x={spot.x} y={spot.y + 34} textAnchor="middle" className="voyage-moon">
                  {isHome ? (ancient ? "Ithaca" : moonName(m.month)) : moonName(m.month)}
                </text>
                <text x={spot.x} y={spot.y + 50} textAnchor="middle" className="voyage-stop">
                  {isHome ? `≈ ${compact(pace)}` : ancient ? STOPS[i] : compact(m.total)}
                </text>
              </g>
            );
          })}

          {/* the ship, rocking on the route */}
          {ship && (
            <g transform={`translate(${ship.x} ${ship.y})`}>
              <motion.g
                animate={{ y: [0, stormy ? -7 : -3, 0], rotate: [ship.angle * 0.5 - (stormy ? 6 : 2), ship.angle * 0.5 + (stormy ? 6 : 2), ship.angle * 0.5 - (stormy ? 6 : 2)] }}
                transition={{ duration: stormy ? 1.8 : 4, repeat: Infinity, ease: "easeInOut" }}
              >
                <image href={shipImg} x="-46" y="-52" width="92" />
              </motion.g>
            </g>
          )}

          {/* compass rose */}
          <g transform="translate(52 62)" opacity="0.5" aria-hidden>
            <circle r="22" fill="none" stroke="#c9a96a" strokeWidth="1" />
            <path d="M0 -26 L5 0 L0 26 L-5 0 Z M-26 0 L0 -5 L26 0 L0 5 Z" fill="none" stroke="#c9a96a" strokeWidth="1" />
            <text y="-30" textAnchor="middle" className="voyage-stop">N</text>
          </g>
        </svg>
      </div>

      {/* the island you're pointing at */}
      <div className="voyage-info" aria-live="polite">
        <strong>{picked === 5 ? (ancient ? "Ithaca, home" : moonLong(choice.month)) : moonLong(choice.month)}</strong>
        <span>
          {picked === 5 ? t("homeExpect", { a: usd(pace) }) : t("spentTotal", { a: usd(choice.total) })}
          {choiceTotal > 0 && (
            <>
              {" · "}
              <b className={choiceDiff > 0 ? "is-over" : "is-under"}>
                {choiceDiff > 0 ? t("overBy", { a: usd(choiceDiff) }) : t("within", { a: usd(-choiceDiff) })}
              </b>
            </>
          )}
        </span>
      </div>

      {/* provisions: ten amphorae that empty as you spend */}
      <div className="voyage-provisions">
        <div className="provisions-head">
          <span className="provisions-label">{t("provLabel")}</span>
          {editing ? (
            <form
              className="provisions-edit"
              onSubmit={(e) => {
                e.preventDefault();
                const v = Number(draft.replace(/[^0-9.]/g, ""));
                if (v > 0) saveProvisions(v);
                setEditing(false);
              }}
            >
              <span>$</span>
              <input value={draft} onChange={(e) => setDraft(e.target.value)} inputMode="decimal" autoFocus aria-label="Provisions per moon" />
              <button className="link-button" type="submit">{t("provSet")}</button>
              {custom !== null && (
                <button className="link-button" type="button" onClick={() => { saveProvisions(null); setEditing(false); }}>
                  {t("provReset")}
                </button>
              )}
            </form>
          ) : (
            <span className="provisions-amount">
              {usd(provisions)}
              <button
                className="link-button"
                onClick={() => {
                  setDraft(String(provisions));
                  setEditing(true);
                }}
              >
                {t("provChange")}
              </button>
            </span>
          )}
        </div>
        <div className="amphorae" title={`${usd(Math.max(0, left))} left`}>
          {Array.from({ length: 10 }, (_, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 + i * 0.05, duration: 0.4, ease: EASE }}
            >
              <Amphora id={String(i)} fill={Math.min(1, Math.max(0, remainingShare * 10 - i))} over={left < 0} />
            </motion.div>
          ))}
        </div>
        <p className={`voyage-forecast ${stormy ? "is-storm" : "is-fair"}`}>
          {stormy
            ? t("voyStorm", { a: usd(pace), b: usd(over) })
            : left >= 0
              ? t("voyFair", { a: usd(left), b: usd(pace) })
              : t("voyUsedUp")}
        </p>
      </div>
    </section>
  );
}
