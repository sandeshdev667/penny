// Resets the database to the clean, curated demo. Use it between judges.
// Run with: npm run demo:reset
//
// 1. Removes EVERYTHING that isn't demo data: every scanned receipt, every imported statement,
//    and any other non-seed transaction (e.g. what a judge just scanned or uploaded).
// 2. Re-runs the seed: 8 months of history + the demo receipts + the demo bank statement.
//
// ⚠️ This deletes real scans and imports too. It's meant for the demo database only.

import "dotenv/config";
import { pool } from "./db.js";

const client = await pool.connect();
try {
  await client.query("BEGIN"); // all-or-nothing
  const receipts = await client.query("DELETE FROM receipts"); // their transactions go with them
  const statements = await client.query("DELETE FROM imports"); // their transactions go with them
  const other = await client.query("DELETE FROM transactions WHERE source <> 'seed'");
  await client.query("COMMIT");
  console.log(
    `🧽 Cleared ${receipts.rowCount} receipts, ${statements.rowCount} statements, ${other.rowCount} other transactions`,
  );
} catch (err) {
  await client.query("ROLLBACK");
  throw err;
} finally {
  client.release();
}

// Now load the curated demo again (seed.ts runs as soon as it's imported, then closes the connection)
await import("./seed.js");
