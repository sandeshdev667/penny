import { useEffect, useState } from "react";
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

export default function Dashboard() {
  // each starts empty, then gets filled from the API
  const [monthly, setMonthly] = useState<MonthlyTotal[]>([]);
  const [categories, setCategories] = useState<CategoryTotal[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null); // null = not loaded yet
  const [merchants, setMerchants] = useState<Merchant[]>([]);

  // runs once when the page opens: ask the server for the data
  useEffect(() => {
    fetch("/api/spending/monthly")
      .then((res) => res.json())
      .then(setMonthly);

    fetch("/api/spending/categories")
      .then((res) => res.json())
      .then(setCategories);

    fetch("/api/summary")
      .then((res) => res.json())
      .then(setSummary);

    fetch("/api/merchants/top")
      .then((res) => res.json())
      .then(setMerchants);
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
