import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";

type DailyTotal = { day: string; total: number };
type CategoryTotal = { category: string; total: number };

export default function App() {
  // each starts as an empty list, then gets filled from the API
  const [data, setData] = useState<DailyTotal[]>([]);
  const [categories, setCategories] = useState<CategoryTotal[]>([]);

  // runs once when the page loads: ask the server for the data
  useEffect(() => {
    fetch("http://localhost:4000/api/spending/daily")
      .then((res) => res.json())
      .then(setData);

    fetch("http://localhost:4000/api/spending/categories")
      .then((res) => res.json())
      .then(setCategories);
  }, []);

  return (
    <main className="page">
      <h1>Penny</h1>

      <section className="card">
        <h2>Daily spending</h2>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data}>
            <CartesianGrid stroke="#e5d9c3" vertical={false} />
            <XAxis dataKey="day" />
            <YAxis />
            <Tooltip />
            <Line dataKey="total" stroke="#c4562a" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </section>

      <section className="card">
        <h2>Spending by category</h2>
        <ResponsiveContainer width="100%" height={350}>
          <BarChart data={categories} layout="vertical">
            <XAxis type="number" />
            <YAxis type="category" dataKey="category" width={130} />
            <Tooltip />
            <Bar dataKey="total" fill="#c4562a" />
          </BarChart>
        </ResponsiveContainer>
      </section>
    </main>
  );
}
