import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { animate, motion } from "motion/react";
import {
  BarChart,
  Cell,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import { usd } from "./format";
import { EASE, rise, stagger } from "./anim";

// Chart colors (match the CSS theme)
const BRONZE = "#a8742c";
const NAVY = "#1b3150";
const GRID = "#e3d8c4";
const TICK = { fill: "#6e695f", fontSize: 12 };
const TOOLTIP = {
  contentStyle: {
    background: "#fbf8f1",
    border: "1px solid #e3d8c4",
    borderRadius: 3,
    fontFamily: "Inter Tight, system-ui, sans-serif",
    fontSize: 13,
  },
  cursor: { fill: "rgba(168, 116, 44, 0.08)" },
};

// 1 -> "I", 4 -> "IV" ... (merchant ranks)
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

// A dollar amount that counts up to its new value instead of jumping
function CountUp({ value }: { value: number }) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const controls = animate(from.current, value, {
      duration: 1.2,
      ease: EASE,
      onUpdate: (v) => {
        from.current = v;
        setShown(v);
      },
    });
    return () => controls.stop();
  }, [value]);
  return <>{usd(shown)}</>;
}

type MonthlyTotal = { month: string; total: number };
type CategoryTotal = { category: string; total: number };
type Merchant = { merchant: string; visits: number; total: number };
type Summary = { this_month: number; last_month: number; top_category: string | null };

// Formats "2026-08" as "Aug"
const monthName = (month: string) =>
  new Date(month + "-01T00:00").toLocaleDateString("en-US", { month: "short" });

// The current month as "YYYY-MM", used to label it "so far"
const now = new Date();
const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

// How often the dashboard checks for new data (milliseconds)
const REFRESH_EVERY = 5000;

// Fetches one API route and updates the state ONLY if the data actually changed.
// (Skipping identical updates stops the charts from re-animating every 5 seconds.)
function load<T>(url: string, setData: Dispatch<SetStateAction<T>>) {
  fetch(url)
    .then((res) => res.json())
    .then((next: T) => setData((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next)))
    .catch(() => {
      // server briefly unavailable (e.g. restarting): keep showing the old data
    });
}

export default function Dashboard() {
  // each starts empty, then gets filled from the API
  const [monthly, setMonthly] = useState<MonthlyTotal[]>([]);
  const [categories, setCategories] = useState<CategoryTotal[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null); // null = not loaded yet
  const [merchants, setMerchants] = useState<Merchant[]>([]);

  // Load the data when the page opens, then check again every 5 seconds.
  // So a receipt scanned on your phone shows up here by itself.
  useEffect(() => {
    function refresh() {
      if (document.hidden) return; // don't check while the tab is in the background
      load("/api/spending/monthly", setMonthly);
      load("/api/spending/categories", setCategories);
      load("/api/summary", setSummary);
      load("/api/merchants/top", setMerchants);
    }

    refresh();
    const timer = setInterval(refresh, REFRESH_EVERY);
    document.addEventListener("visibilitychange", refresh); // refresh right away when you come back to the tab

    // cleanup when leaving the Dashboard page
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  // the biggest total, used to size each merchant's bar (biggest = full width)
  const topTotal = merchants[0]?.total ?? 1;

  return (
    // stagger + rise: the cards fade in one after another
    <motion.div className="content" variants={stagger} initial="hidden" animate="show">
      {/* Summary boxes ("—" shows while loading) */}
      <div className="stats">
        <motion.div className="card stat" variants={rise}>
          <span className="stat-label">This month</span>
          <span className="stat-value">{summary ? <CountUp value={summary.this_month} /> : "—"}</span>
          <span className="stat-note">so far</span>
        </motion.div>
        <motion.div className="card stat" variants={rise}>
          <span className="stat-label">Last month</span>
          <span className="stat-value">{summary ? <CountUp value={summary.last_month} /> : "—"}</span>
          <span className="stat-note">full month</span>
        </motion.div>
        <motion.div className="card stat" variants={rise}>
          <span className="stat-label">Top category</span>
          <span className="stat-value">{summary?.top_category ?? "—"}</span>
          <span className="stat-note">where most of it went</span>
        </motion.div>
      </div>

      {/* Monthly spending, full width */}
      <motion.section className="card" variants={rise}>
        <div className="card-head">
          <h2>Spending by month</h2>
          <span className="legend">
            <i className="legend-swatch" /> full month <i className="legend-swatch legend-sofar" /> so far
          </span>
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={monthly}>
            {/* striped fill for the current (unfinished) month */}
            <defs>
              <pattern id="sofar" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="6" height="6" fill="#ead7b0" />
                <line x1="0" y1="0" x2="0" y2="6" stroke={BRONZE} strokeWidth="3" />
              </pattern>
            </defs>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="month" tickFormatter={monthName} tick={TICK} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={usd} width={70} tick={TICK} axisLine={false} tickLine={false} />
            <Tooltip
              {...TOOLTIP}
              formatter={(v) => usd(Number(v))}
              labelFormatter={(m) => monthName(String(m)) + (m === thisMonth ? " (so far)" : "")}
            />
            <Bar dataKey="total" name="Spent" radius={[2, 2, 0, 0]} maxBarSize={56}>
              {monthly.map((m) => (
                <Cell key={m.month} fill={m.month === thisMonth ? "url(#sofar)" : BRONZE} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </motion.section>

      {/* Two cards side by side */}
      <div className="grid-2">
        <motion.section className="card" variants={rise}>
          <h2>By category</h2>
          <ResponsiveContainer width="100%" height={340}>
            <BarChart data={categories} layout="vertical">
              <XAxis type="number" tickFormatter={usd} tick={TICK} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="category" width={130} tick={TICK} axisLine={false} tickLine={false} />
              <Tooltip {...TOOLTIP} formatter={(v) => usd(Number(v))} />
              <Bar dataKey="total" name="Spent" fill={NAVY} radius={[0, 2, 2, 0]} maxBarSize={22} />
            </BarChart>
          </ResponsiveContainer>
        </motion.section>

        <motion.section className="card" variants={rise}>
          <h2>Top merchants</h2>
          <ol className="merchant-list">
            {merchants.map((m, i) => (
              <li key={m.merchant} className="merchant">
                <span className="merchant-rank">{ROMAN[i] ?? i + 1}</span>
                <div className="merchant-info">
                  <div className="merchant-row">
                    <span className="merchant-name">{m.merchant}</span>
                    <span className="merchant-total">{usd(m.total)}</span>
                  </div>
                  <div className="merchant-bar">
                    {/* the bar grows from 0 to its width */}
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${(m.total / topTotal) * 100}%` }}
                      transition={{ duration: 1, delay: 0.3 + i * 0.06, ease: EASE }}
                    />
                  </div>
                  <span className="merchant-visits">{m.visits} visits</span>
                </div>
              </li>
            ))}
          </ol>
        </motion.section>
      </div>
    </motion.div>
  );
}
