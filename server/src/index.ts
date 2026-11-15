import "dotenv/config"; // loads .env into process.env (first, before anything else)
import express from "express";
import cors from "cors";
import multer from "multer";
import type { ErrorRequestHandler } from "express";
import { pool } from "./db.js"; // ".js" ending is correct, it loads db.ts
import { parseReceipt, checkReceipt } from "./gemini.js";
import { validateReceipt, saveReceipt } from "./receipts.js";
import { askAthena, type ChatMessage, type Tone } from "./athena.js";
import { parseStatement, findDuplicates, validateImport, saveStatement } from "./statements.js";

const app = express();
const port = Number(process.env.PORT) || 3001;
const TZ = process.env.APP_TIMEZONE || "America/Chicago";

app.use(cors()); // allow the React app to call this API
app.use(express.json({ limit: "1mb" })); // parse JSON request bodies (1 MB: big statement imports)

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

// The last 5 saved receipts and statements (for "Recent scans"), plus how many receipts there are in total.
// A statement shows up as ONE entry (kind = 'statement'), named after the bank, dated the day it was imported.
// Receipts come from `receipts`, statements from `imports` (same response shape as before).
app.get("/api/receipts/recent", async (_req, res) => {
  const recent = await pool.query(
    `SELECT id, kind, merchant, date, total, lines, categories FROM (
       SELECT r.id::int AS id,
              'receipt' AS kind,
              MIN(t.merchant) AS merchant,
              to_char(MIN(t.spent_at) AT TIME ZONE $1::text, 'YYYY-MM-DD') AS date,
              SUM(t.amount)::float AS total,
              COUNT(*)::int AS lines,
              array_agg(DISTINCT t.category) AS categories,
              MAX(r.uploaded_at) AS uploaded_at
       FROM receipts r JOIN transactions t ON t.receipt_id = r.id
       GROUP BY r.id
       UNION ALL
       SELECT i.id::int,
              'statement',
              COALESCE(MIN(i.bank), 'Bank statement'),
              to_char(MAX(i.uploaded_at) AT TIME ZONE $1::text, 'YYYY-MM-DD'),
              SUM(t.amount)::float,
              COUNT(*)::int,
              array_agg(DISTINCT t.category),
              MAX(i.uploaded_at)
       FROM imports i JOIN transactions t ON t.import_id = i.id
       GROUP BY i.id
     ) AS uploads
     ORDER BY uploaded_at DESC
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

// ---------- Bank statements ----------

// Statement PDFs can be bigger than photos: up to 20 MB
const uploadPdf = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// Step 1: Gemini reads every transaction in the PDF. We flag possible duplicates. Nothing is saved yet.
app.post("/api/statements/parse", uploadPdf.single("statement"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "No PDF uploaded (the form field must be named 'statement')" });
    return;
  }
  if (req.file.mimetype !== "application/pdf") {
    res.status(400).json({ error: "The file must be a PDF" });
    return;
  }
  const { isStatement, bank, rows } = await parseStatement(req.file.buffer);
  if (!isStatement || rows.length === 0) {
    res.status(400).json({ error: "That doesn't look like a bank or card statement with transactions." });
    return;
  }
  const duplicates = await findDuplicates(rows);
  res.json({
    bank,
    transactions: rows.map((r, i) => ({ ...r, duplicate: duplicates.get(i) ?? null })),
  });
});

// Step 2: save the rows the user ticked
app.post("/api/statements", async (req, res) => {
  let data;
  try {
    data = validateImport(req.body);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Invalid statement" });
    return;
  }
  res.json(await saveStatement(data));
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
  const tone: Tone = req.body?.tone === "modern" ? "modern" : "ancient";
  res.json(await askAthena(question, history, tone));
});

// Athena's voice: turns her answer into speech with ElevenLabs. Returns an MP3.
// The voice is found BY NAME (ELEVENLABS_VOICE_NAME in .env, default "Sandesh Aryal"), once, then remembered.
const VOICE_NAME = process.env.ELEVENLABS_VOICE_NAME || "Sandesh Aryal";
let voiceId: string | null = process.env.ELEVENLABS_VOICE_ID || null; // set this to skip the lookup

async function findVoiceId(key: string): Promise<string> {
  if (voiceId) return voiceId;
  const res = await fetch("https://api.elevenlabs.io/v1/voices", {
    headers: { "xi-api-key": key },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`voice list failed (${res.status})`);
  const data = (await res.json()) as { voices?: { voice_id: string; name: string }[] };
  const wanted = VOICE_NAME.trim().toLowerCase();
  const voice = data.voices?.find((v) => v.name.trim().toLowerCase() === wanted);
  if (!voice) {
    console.warn(`ElevenLabs: no voice named "${VOICE_NAME}" in this account. Voices found: ${data.voices?.map((v) => v.name).join(", ")}`);
    throw new Error(`no voice named "${VOICE_NAME}"`);
  }
  voiceId = voice.voice_id;
  return voiceId;
}

app.post("/api/athena/speak", async (req, res) => {
  const text = typeof req.body?.text === "string" ? req.body.text.trim().slice(0, 700) : "";
  if (!text) {
    res.status(400).json({ error: "Nothing to say" });
    return;
  }
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) {
    res.status(501).json({ error: "Athena's voice is not set up (no ELEVENLABS_API_KEY)" });
    return;
  }
  let id: string;
  try {
    id = await findVoiceId(key);
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? `Athena's voice: ${err.message}` : "Athena's voice could not be found" });
    return;
  }
  const upstream = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(id)}?output_format=mp3_44100_64`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({
      text,
      model_id: process.env.ELEVENLABS_MODEL || "eleven_multilingual_v2",
      voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.2 },
    }),
    signal: AbortSignal.timeout(25000),
  });
  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
    console.warn("ElevenLabs speech error:", upstream.status, detail.slice(0, 300));
    res.status(502).json({ error: `Athena's voice could not be reached (${upstream.status})` });
    return;
  }
  res.setHeader("Content-Type", "audio/mpeg");
  res.send(Buffer.from(await upstream.arrayBuffer()));
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
