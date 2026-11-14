import "dotenv/config"; // loads .env into process.env (first, before anything else)
import express from "express";
import cors from "cors";
import { pool } from "./db.js"; // ".js" ending is correct, it loads db.ts

const app = express();
const port = Number(process.env.PORT) || 3001;

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

app.listen(port, () => {
  console.log(`Penny server running on http://localhost:${port}`);
});
