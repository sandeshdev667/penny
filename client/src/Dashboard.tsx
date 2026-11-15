import { lazy, Suspense, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { animate, motion } from "motion/react";
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { usd, money } from "./format";
import { EASE, rise, stagger } from "./anim";
import { RepeatIcon } from "./icons";
// the 3D voyage is big (three.js), so it is only downloaded when the dashboard opens
const Voyage3D = lazy(() => import("./Voyage3D"));
import { useLang } from "./lang";
import shipImg from "./assets/ship.png";

// Chart colors (match the CSS theme)
const BRONZE = "#a8742c";
const GRID = "#e3d8c4";
const TICK = { fill: "#6e695f", fontSize: 12 };

// Current-month point: a hollow circle (the month isn't over yet). Other points on that line draw nothing.
function SoFarDot({ cx, cy, index, payload }: { cx?: number; cy?: number; index?: number; payload?: { month: string } }) {
  if (payload?.month !== thisMonth || cx === undefined || cy === undefined) return <g key={index} />;
  return <circle key={index} cx={cx} cy={cy} r={4.5} fill="#fbf8f1" stroke={BRONZE} strokeWidth={2} />;
}

// One earthy color per category (same order as receiptTypes.ts)
const CATEGORY_COLORS: Record<string, string> = {
  Groceries: "#5f7a4a",
  Dining: "#b5562f",
  Transport: "#3d5a80",
  Shopping: "#a8742c",
  Health: "#4f8a83",
  "Bills & Utilities": "#1b3150",
  Entertainment: "#7d4e7a",
  Subscriptions: "#c99a3d",
  Travel: "#6b8fb3",
  Education: "#8a6a4f",
  Other: "#9a948a",
};
const colorFor = (category: string) => CATEGORY_COLORS[category] ?? "#9a948a";

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
export type MonthCategory = { month: string; category: string; total: number };
type Merchant = { merchant: string; visits: number; total: number };
type Summary = { this_month: number; last_month: number; top_category: string | null };
type Recurring = {
  merchant: string;
  category: string;
  frequency: "monthly" | "weekly";
  amount: number;
  varies: boolean; // amount changes a little each time (e.g. internet bill)
  next_charge: string; // "YYYY-MM-DD"
  monthly_cost: number;
};

// Days from today until a "YYYY-MM-DD" date (negative = already passed)
function daysUntil(date: string) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return Math.round((new Date(date + "T00:00").getTime() - start.getTime()) / 86400000);
}

// "Dec 1" style label for the next charge
function nextLabel(date: string) {
  const days = daysUntil(date);
  if (days < 0) return "due now";
  if (days === 0) return "due today";
  if (days === 1) return "due tomorrow";
  return "next ~" + new Date(date + "T00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Formats "2026-08" as "Aug"
const monthName = (month: string) =>
  new Date(month + "-01T00:00").toLocaleDateString("en-US", { month: "short" });

// Today's place in the month (used for "so far" and the pace)
const now = new Date();
const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
const dayOfMonth = now.getDate();
const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
const monthGone = dayOfMonth / daysInMonth; // 0..1

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
  const { t, cat } = useLang();
  // each starts empty, then gets filled from the API
  const [monthly, setMonthly] = useState<MonthlyTotal[]>([]);
  const [categories, setCategories] = useState<CategoryTotal[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null); // null = not loaded yet
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [recurring, setRecurring] = useState<Recurring[]>([]);
  const [monthCats, setMonthCats] = useState<MonthCategory[]>([]); // each month, split by category
  const [catView, setCatView] = useState<"all" | "month">("all"); // "By category": all time, or one month
  const [catMonth, setCatMonth] = useState<string | null>(null); // which month (null = the latest)

  // Load the data when the page opens, then check again every 5 seconds.
  // So a receipt scanned on your phone shows up here by itself.
  useEffect(() => {
    function refresh() {
      if (document.hidden) return; // don't check while the tab is in the background
      load("/api/spending/monthly", setMonthly);
      load("/api/spending/categories", setCategories);
      load("/api/spending/monthly-categories", setMonthCats);
      load("/api/summary", setSummary);
      load("/api/merchants/top", setMerchants);
      load("/api/recurring", setRecurring);
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

  // ---------- Numbers worked out from the data ----------
  const topTotal = merchants[0]?.total ?? 1; // biggest merchant = full-width bar
  const recurringPerMonth = recurring.reduce((sum, r) => sum + r.monthly_cost, 0);
  // "By category" can show all time, or a single month (step through months with the arrows)
  const catMonths = [...new Set(monthCats.map((r) => r.month))].sort();
  const shownMonth = catMonth && catMonths.includes(catMonth) ? catMonth : catMonths[catMonths.length - 1];
  const monthIndex = catMonths.indexOf(shownMonth);
  const shownCategories: CategoryTotal[] =
    catView === "all"
      ? categories
      : monthCats.filter((r) => r.month === shownMonth).map((r) => ({ category: r.category, total: r.total }));
  const categoryTotal = shownCategories.reduce((sum, c) => sum + Math.max(0, c.total), 0) || 1;

  // average of the FINISHED months (the current month isn't over yet)
  const fullMonths = monthly.filter((m) => m.month !== thisMonth);
  const monthlyAverage = fullMonths.length ? fullMonths.reduce((s, m) => s + m.total, 0) / fullMonths.length : 0;

  // For the line chart: "full" = finished months (solid line), "sofar" = last month -> this month (dashed)
  const lineData = monthly.map((m, i) => {
    const isNow = m.month === thisMonth;
    const nextIsNow = monthly[i + 1]?.month === thisMonth;
    return { ...m, full: isNow ? null : m.total, sofar: isNow || nextIsNow ? m.total : null };
  });

  // This month vs last month
  const pace = summary ? (summary.this_month / dayOfMonth) * daysInMonth : 0; // if you keep spending like this
  const shareOfLast = summary && summary.last_month > 0 ? summary.this_month / summary.last_month : 0;

  return (
    // stagger + rise: the cards fade in one after another
    <motion.div className="content" variants={stagger} initial="hidden" animate="show">
      {/* ---------- The ledger: this month at a glance ---------- */}
      <motion.section className="ledger" variants={rise}>
        <img src={shipImg} alt="" className="ledger-ship" aria-hidden />

        <div className="ledger-main">
          <span className="ledger-label">{t("thisSoFar")}</span>
          <span className="ledger-value">{summary ? <CountUp value={summary.this_month} /> : "—"}</span>
          <span className="ledger-note">
            {t("dayLine", { a: dayOfMonth, b: daysInMonth })}
            {summary && summary.this_month > 0 && t("paceLine", { a: usd(pace) })}
          </span>
        </div>

        <dl className="ledger-side">
          <div>
            <dt>{t("lastPeriod")}</dt>
            <dd>{summary ? usd(summary.last_month) : "—"}</dd>
          </div>
          <div>
            <dt>{t("greatest")}</dt>
            <dd>{summary?.top_category ? cat(summary.top_category) : "—"}</dd>
          </div>
          <div>
            <dt>{t("tributes")}</dt>
            <dd>{recurring.length ? `≈ ${usd(recurringPerMonth)}/mo` : "—"}</dd>
          </div>
        </dl>

        {/* Meter: how much of last month's total you've already spent, vs how much of the month is gone */}
        {summary && summary.last_month > 0 && (
          <div className="ledger-meter">
            <div className="meter-track">
              <motion.div
                className="meter-fill"
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(shareOfLast, 1) * 100}%` }}
                transition={{ duration: 1.2, delay: 0.3, ease: EASE }}
              />
              <span className="meter-today" style={{ left: `${monthGone * 100}%` }} title="Today" />
            </div>
            <span className="meter-caption">
              {t("meterCaption", { a: Math.round(shareOfLast * 100), b: Math.round(monthGone * 100) })}
            </span>
          </div>
        )}
      </motion.section>

      {/* ---------- Monthly spending ---------- */}
      <motion.section className="card" variants={rise}>
        <div className="card-head">
          <h2>{t("spendByPeriod")}</h2>
          <span className="legend">
            <i className="legend-solid" /> {t("legendFull")} <i className="legend-dashed" /> so far
            {monthlyAverage > 0 && (
              <>
                <i className="legend-line" /> average
              </>
            )}
          </span>
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={lineData} margin={{ top: 12, right: 12, left: 0 }}>
            {/* soft bronze fill under the line */}
            <defs>
              <linearGradient id="spendFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={BRONZE} stopOpacity={0.28} />
                <stop offset="1" stopColor={BRONZE} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="month" tickFormatter={monthName} tick={TICK} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={usd} width={70} tick={TICK} axisLine={false} tickLine={false} />
            <Tooltip
              cursor={{ stroke: BRONZE, strokeOpacity: 0.3 }}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <div className="chart-tip">
                    <span>{monthName(String(label)) + (label === thisMonth ? " (so far)" : "")}</span>
                    <strong>{usd(Number(payload[0].payload.total))}</strong>
                  </div>
                ) : null
              }
            />
            <Area type="monotone" dataKey="total" stroke="none" fill="url(#spendFill)" />
            {monthlyAverage > 0 && (
              <ReferenceLine
                y={monthlyAverage}
                stroke="#1b3150"
                strokeDasharray="2 4"
                label={{ value: `avg ${usd(monthlyAverage)}`, position: "insideTopLeft", fill: "#1b3150", fontSize: 12 }}
              />
            )}
            <Line
              type="monotone"
              dataKey="full"
              stroke={BRONZE}
              strokeWidth={2.5}
              dot={{ r: 3.5, fill: BRONZE, stroke: "#fbf8f1", strokeWidth: 2 }}
              activeDot={{ r: 5.5, fill: BRONZE, stroke: "#fbf8f1", strokeWidth: 2 }}
            />
            <Line
              type="monotone"
              dataKey="sofar"
              stroke={BRONZE}
              strokeWidth={2.5}
              strokeDasharray="6 5"
              dot={<SoFarDot />}
              activeDot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </motion.section>

      {/* ---------- The Voyage: sail between months in 3D; gold coins show what was spent ---------- */}
      <motion.div variants={rise}>
        <Suspense fallback={<section className="card voyage3d-loading">{t("voyLoading")}</section>}>
          <Voyage3D monthCats={monthCats} thisMonth={thisMonth} />
        </Suspense>
      </motion.div>

      <div className="grid-2">
        {/* ---------- Categories: one stacked bar + the list ---------- */}
        <motion.section className="card" variants={rise}>
          <div className="card-head">
            <h2>{t("byCategory")}</h2>
            {/* all time, or one month at a time */}
            <div className="cat-controls">
              <div className="seg" role="group" aria-label="Category period">
                <button className={catView === "all" ? "is-on" : ""} onClick={() => setCatView("all")} aria-pressed={catView === "all"}>
                  {t("allTime")}
                </button>
                <button className={catView === "month" ? "is-on" : ""} onClick={() => setCatView("month")} aria-pressed={catView === "month"}>
                  {t("byMonth")}
                </button>
              </div>
              {catView === "month" && shownMonth && (
                <div className="month-step">
                  <button
                    className="icon-button"
                    onClick={() => setCatMonth(catMonths[monthIndex - 1])}
                    disabled={monthIndex <= 0}
                    aria-label="Previous month"
                  >
                    ‹
                  </button>
                  <span>{new Date(shownMonth + "-01T00:00").toLocaleDateString("en-US", { month: "short", year: "numeric" })}</span>
                  <button
                    className="icon-button"
                    onClick={() => setCatMonth(catMonths[monthIndex + 1])}
                    disabled={monthIndex >= catMonths.length - 1}
                    aria-label="Next month"
                  >
                    ›
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="category-strip">
            {shownCategories.filter((c) => c.total > 0).map((c, i) => (
              <motion.span
                key={c.category}
                style={{ background: colorFor(c.category) }}
                initial={{ flexGrow: 0 }}
                animate={{ flexGrow: c.total }}
                transition={{ duration: 1, delay: 0.2 + i * 0.04, ease: EASE }}
                title={`${cat(c.category)}: ${usd(c.total)}`}
              />
            ))}
          </div>
          <ul className="category-list">
            {shownCategories.map((c) => (
              <li key={c.category}>
                <i style={{ background: colorFor(c.category) }} />
                <span className="category-name">{cat(c.category)}</span>
                <span className="category-share">{Math.round((c.total / categoryTotal) * 100)}%</span>
                <span className="merchant-total">{usd(c.total)}</span>
              </li>
            ))}
          </ul>
        </motion.section>

        {/* ---------- Top merchants ---------- */}
        <motion.section className="card" variants={rise}>
          <div className="card-head">
            <h2>{t("merchantsTitle")}</h2>
            <span className="card-note">{t("merchantsNote")}</span>
          </div>
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

      {/* ---------- Recurring charges ---------- */}
      <motion.section className="card" variants={rise}>
        <div className="card-head">
          <h2 className="with-icon">
            <RepeatIcon className="card-icon" />
            {t("recurringTitle")}
          </h2>
          {recurring.length > 0 && <span className="card-header-note">≈ {usd(recurringPerMonth)} / month</span>}
        </div>

        {recurring.length === 0 ? (
          <p className="muted">{t("recurringNone")}</p>
        ) : (
          <ul className="recurring-list">
            {recurring.map((r) => {
              const dueSoon = daysUntil(r.next_charge) <= 7;
              return (
                <li key={r.merchant} className={`recurring ${dueSoon ? "due-soon" : ""}`}>
                  <div className="recurring-info">
                    <span className="merchant-name">{r.merchant}</span>
                    <span className="recurring-when">
                      {r.frequency === "monthly" ? "Monthly" : "Weekly"} · {nextLabel(r.next_charge)}
                      {dueSoon && <span className="due-badge">due soon</span>}
                    </span>
                  </div>
                  <span className="tag">{cat(r.category)}</span>
                  <span className="merchant-total">
                    {r.varies ? "~" : ""}
                    {money(r.amount)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </motion.section>
    </motion.div>
  );
}
