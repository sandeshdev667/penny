import "dotenv/config"; // loads .env into process.env (first, before anything else)
import express from "express";
import cors from "cors";
import multer from "multer";
import type { ErrorRequestHandler } from "express";
import { pool } from "./db.js"; // ".js" ending is correct, it loads db.ts
import { parseReceipt, checkReceipt } from "./gemini.js";
import { validateReceipt, saveReceipt } from "./receipts.js";
import { askAthena, type ChatMessage } from "./athena.js";

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

// Summary numbers for the top boxes: this month, last month, top category this month
app.get("/api/summary", async (_req, res) => {
  const result = await pool.query(
    `WITH bounds AS (
       SELECT date_trunc('month', now() AT TIME ZONE $1::text) AT TIME ZONE $1::text AS this_start,
              (date_trunc('month', now() AT TIME ZONE $1::text) - interval '1 month') AT TIME ZONE $1::text AS last_start
     )
     SELECT
       (SELECT COALESCE(SUM(amount), 0)::float FROM transactions, bounds
         WHERE spent_at >= this_start) AS this_month,
       (SELECT COALESCE(SUM(amount), 0)::float FROM transactions, bounds
         WHERE spent_at >= last_start AND spent_at < this_start) AS last_month,
       (SELECT category FROM transactions, bounds
         WHERE spent_at >= this_start
         GROUP BY category ORDER BY SUM(amount) DESC LIMIT 1) AS top_category`,
    [TZ],
  );
  res.json(result.rows[0]);
});

// Total spending for each month
app.get("/api/spending/monthly", async (_req, res) => {
  const result = await pool.query(
    `SELECT to_char(time_bucket('1 month', spent_at, $1::text) AT TIME ZONE $1::text, 'YYYY-MM') AS month,
            SUM(amount)::float AS total
     FROM transactions
     GROUP BY month
     ORDER BY month`,
    [TZ],
  );
  res.json(result.rows);
});

// Top 5 merchants for everyday spending (rent/bills and tuition left out)
app.get("/api/merchants/top", async (_req, res) => {
  const result = await pool.query(
    `SELECT merchant,
            -- a receipt split into several categories still counts as ONE visit
            COUNT(DISTINCT COALESCE('r' || receipt_id, 't' || id))::int AS visits,
            SUM(amount)::float AS total
     FROM transactions
     WHERE category NOT IN ('Bills & Utilities', 'Education')
     GROUP BY merchant
     ORDER BY total DESC
     LIMIT 5`,
  );
  res.json(result.rows);
});

// Recurring charges: same store, about the same amount, on a regular schedule (monthly or weekly)
app.get("/api/recurring", async (_req, res) => {
  const result = await pool.query(
    `WITH visits AS (
       -- one row per visit (a receipt split into several categories counts once)
       SELECT merchant, spent_at, SUM(amount) AS amount, MIN(category) AS category
       FROM transactions
       WHERE spent_at > now() - interval '6 months'
       GROUP BY merchant, spent_at
     ),
     gaps AS (
       -- days since the previous visit to the same store (a "window function")
       SELECT *, EXTRACT(EPOCH FROM spent_at - LAG(spent_at) OVER (PARTITION BY merchant ORDER BY spent_at)) / 86400 AS gap_days
       FROM visits
     ),
     stats AS (
       SELECT merchant,
              mode() WITHIN GROUP (ORDER BY category) AS category,
              COUNT(*) AS times,
              AVG(amount) AS avg_amount,
              MIN(amount) AS min_amount,
              MAX(amount) AS max_amount,
              MAX(spent_at) AS last_charge,
              AVG(gap_days) AS avg_gap,
              STDDEV_POP(gap_days) AS gap_spread
       FROM gaps
       GROUP BY merchant
     )
     SELECT merchant,
            category,
            CASE WHEN avg_gap BETWEEN 25 AND 35 THEN 'monthly' ELSE 'weekly' END AS frequency,
            ROUND(avg_amount, 2)::float AS amount,
            (max_amount <> min_amount) AS varies,
            to_char(next_at AT TIME ZONE $1::text, 'YYYY-MM-DD') AS next_charge,
            ROUND(CASE WHEN avg_gap BETWEEN 25 AND 35 THEN avg_amount ELSE avg_amount * 52 / 12 END, 2)::float AS monthly_cost
     FROM (
       -- predicted next charge: same day next month, or 7 days later for weekly
       SELECT *, last_charge + CASE WHEN avg_gap BETWEEN 25 AND 35 THEN interval '1 month' ELSE interval '7 days' END AS next_at
       FROM stats
     ) s
     WHERE times >= 3
       AND avg_amount > 0
       AND (max_amount - min_amount) <= 0.1 * avg_amount            -- about the same amount each time
       AND (avg_gap BETWEEN 25 AND 35 OR avg_gap BETWEEN 6 AND 8)   -- monthly or weekly
       AND gap_spread <= 4                                          -- on a steady schedule
       AND next_at > now() - interval '7 days'                      -- not cancelled
     ORDER BY monthly_cost DESC`,
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

// ---------- Receipts ----------

// Keeps uploaded photos in memory (not on disk), max 10 MB
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Step 1 of scanning: Gemini reads the photo. Nothing is saved yet.
app.post("/api/receipts/parse", upload.single("image"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "No image uploaded (the form field must be named 'image')" });
    return;
  }
  if (!req.file.mimetype.startsWith("image/")) {
    res.status(400).json({ error: "The file must be an image" });
    return;
  }
  const receipt = await parseReceipt(req.file.buffer, req.file.mimetype);
  res.json({ receipt, problems: checkReceipt(receipt) });
});

// The last 5 saved receipts (for "Recent scans"), plus how many receipts there are in total
app.get("/api/receipts/recent", async (_req, res) => {
  const recent = await pool.query(
    `SELECT r.id::int AS id,
            MIN(t.merchant) AS merchant,
            to_char(MIN(t.spent_at) AT TIME ZONE $1::text, 'YYYY-MM-DD') AS date,
            SUM(t.amount)::float AS total,
            array_agg(DISTINCT t.category) AS categories
     FROM receipts r
     JOIN transactions t ON t.receipt_id = r.id
     GROUP BY r.id
     ORDER BY MAX(r.uploaded_at) DESC
     LIMIT 5`,
    [TZ],
  );
  const count = await pool.query("SELECT COUNT(*)::int AS count FROM receipts");
  res.json({ receipts: recent.rows, count: count.rows[0].count });
});

// Step 2 of scanning: save the (reviewed) receipt to the database
app.post("/api/receipts", async (req, res) => {
  let final;
  try {
    final = validateReceipt(req.body?.receipt);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Invalid receipt" });
    return;
  }
  const saved = await saveReceipt(final, req.body?.original);
  res.json(saved);
});

// ---------- Ask Athena ----------

// Body: { question: "How much did I spend on dining?", history: [{ role, text, sql }] }
app.post("/api/athena", async (req, res) => {
  const question = typeof req.body?.question === "string" ? req.body.question.trim() : "";
  if (!question) {
    res.status(400).json({ error: "Please type a question" });
    return;
  }
  if (question.length > 500) {
    res.status(400).json({ error: "That question is too long" });
    return;
  }
  const history: ChatMessage[] = Array.isArray(req.body?.history) ? req.body.history : [];
  res.json(await askAthena(question, history));
});

// If any route throws an error, reply with JSON instead of an HTML error page
const handleErrors: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err instanceof Error ? err.message : "Something went wrong" });
};
app.use(handleErrors);

app.listen(port, () => {
  console.log(`Penny server running on http://localhost:${port}`);
});
