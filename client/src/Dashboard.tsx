import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import { usd } from "./format";

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
    <div className="content">
      {/* Summary boxes ("—" shows while loading) */}
      <div className="stats">
        <div className="card">
          <span className="stat-label">This month</span>
          <span className="stat-value">{summary ? usd(summary.this_month) : "—"}</span>
        </div>
        <div className="card">
          <span className="stat-label">Last month</span>
          <span className="stat-value">{summary ? usd(summary.last_month) : "—"}</span>
        </div>
        <div className="card">
          <span className="stat-label">Top category</span>
          <span className="stat-value">{summary?.top_category ?? "—"}</span>
        </div>
      </div>

      {/* Monthly spending, full width */}
      <section className="card">
        <h2>Spending by month</h2>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={monthly}>
            <CartesianGrid stroke="#e5d9c3" vertical={false} />
            <XAxis dataKey="month" tickFormatter={monthName} />
            <YAxis tickFormatter={usd} width={70} />
            <Tooltip
              formatter={(v) => usd(Number(v))}
              labelFormatter={(m) => monthName(String(m)) + (m === thisMonth ? " (so far)" : "")}
            />
            <Bar dataKey="total" name="Spent" fill="#c4562a" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </section>

      {/* Two cards side by side */}
      <div className="grid-2">
        <section className="card">
          <h2>By category</h2>
          <ResponsiveContainer width="100%" height={340}>
            <BarChart data={categories} layout="vertical">
              <XAxis type="number" tickFormatter={usd} />
              <YAxis type="category" dataKey="category" width={130} />
              <Tooltip formatter={(v) => usd(Number(v))} />
              <Bar dataKey="total" name="Spent" fill="#c4562a" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </section>

        <section className="card">
          <h2>Top merchants</h2>
          <ol className="merchant-list">
            {merchants.map((m, i) => (
              <li key={m.merchant} className="merchant">
                <span className="merchant-rank">{i + 1}</span>
                <div className="merchant-info">
                  <div className="merchant-row">
                    <span className="merchant-name">{m.merchant}</span>
                    <span className="merchant-total">{usd(m.total)}</span>
                  </div>
                  <div className="merchant-bar">
                    <div style={{ width: `${(m.total / topTotal) * 100}%` }} />
                  </div>
                  <span className="merchant-visits">{m.visits} visits</span>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
