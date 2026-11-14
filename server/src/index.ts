import "dotenv/config"; // loads .env into process.env (first, before anything else)
import express from "express";
import cors from "cors";
import { pool } from "./db.js"; // ".js" ending is correct, it loads db.ts

const app = express();
const port = Number(process.env.PORT) || 3001;
const TZ = process.env.APP_TIMEZONE || "America/Chicago";

app.use(cors()); // allow the React app to call this API
app.use(express.json()); // parse JSON request bodies

// Health check: a simple route to confirm the server is alive
app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

// Database check: asks the database for the current time and TimescaleDB version
app.get("/api/db-check", async (_req, res) => {
  const result = await pool.query(`
    SELECT now() AS time,
           (SELECT extversion FROM pg_extension WHERE extname = 'timescaledb') AS timescaledb
  `);
  res.json(result.rows[0]);
});

// Total spending for each day (time_bucket is a TimescaleDB feature)
app.get("/api/spending/daily", async (_req, res) => {
  const result = await pool.query(
    `SELECT to_char(time_bucket('1 day', spent_at, $1::text) AT TIME ZONE $1::text, 'YYYY-MM-DD') AS day,
            SUM(amount)::float AS total
     FROM transactions
     GROUP BY day
     ORDER BY day`,
    [TZ],
  );
  res.json(result.rows);
});

// Total spending per category, biggest first
app.get("/api/spending/categories", async (_req, res) => {
  const result = await pool.query(
    `SELECT category, SUM(amount)::float AS total
     FROM transactions
     GROUP BY category
     ORDER BY total DESC`,
  );
  res.json(result.rows);
});

app.listen(port, () => {
  console.log(`Penny server running on http://localhost:${port}`);
});
