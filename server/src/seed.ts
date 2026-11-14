// Fills the transactions table with ~6 months of fake purchases for the demo.
// Run with: npm run db:seed
// Safe to re-run: it deletes old seed rows first (real receipt/csv rows are never touched).

import "dotenv/config";
import { pool } from "./db.js";

const TZ = process.env.APP_TIMEZONE || "America/Chicago";

// ---------- Random helpers ----------
// A "seeded" random generator: it gives the SAME sequence every run,
// so the demo data looks identical each time we re-seed.
let seed = 42;
function rand(): number {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296; // number between 0 and 1
}
const chance = (p: number) => rand() < p; // true p% of the time
const money = (min: number, max: number) => Math.round((min + rand() * (max - min)) * 100) / 100;
const pick = <T>(items: T[]): T => items[Math.floor(rand() * items.length)]!;
const pad = (n: number) => String(n).padStart(2, "0");

// ---------- Build the list of purchases ----------
type Row = { localTime: string; merchant: string; category: string; amount: number };
const rows: Row[] = [];

// Adds one purchase on `date` at a random time between fromHour and toHour
function add(date: string, merchant: string, category: string, amount: number, fromHour = 8, toHour = 21) {
  const hour = fromHour + Math.floor(rand() * (toHour - fromHour));
  const minute = Math.floor(rand() * 60);
  rows.push({ localTime: `${date} ${pad(hour)}:${pad(minute)}`, merchant, category, amount });
}

// Date range: 6 months ago -> yesterday (today stays empty for the live receipt demo)
const today = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date()); // "YYYY-MM-DD"
const [y, m, d] = today.split("-").map(Number) as [number, number, number];
const start = new Date(Date.UTC(y, m - 1 - 6, d));
const end = new Date(Date.UTC(y, m - 1, d - 1));

for (const day = new Date(start); day <= end; day.setUTCDate(day.getUTCDate() + 1)) {
  const date = day.toISOString().slice(0, 10); // "2026-08-15"
  const dayOfMonth = day.getUTCDate();
  const monthDay = date.slice(5); // "08-15"

  // Monthly bills and subscriptions (same day every month)
  if (dayOfMonth === 1) add(date, "Campus Edge Apartments", "Bills & Utilities", 750, 9, 10);
  if (dayOfMonth === 5) {
    add(date, "T-Mobile", "Bills & Utilities", 45, 9, 10);
    add(date, "Spectrum Internet", "Bills & Utilities", money(38, 42), 9, 10);
  }
  if (dayOfMonth === 12) add(date, "Netflix", "Subscriptions", 15.49, 6, 7);
  if (dayOfMonth === 20) add(date, "Spotify", "Subscriptions", 11.99, 6, 7);

  // Everyday spending (random chance each day)
  if (chance(2 / 7)) add(date, pick(["Walmart", "H-E-B", "Kroger"]), "Groceries", money(25, 90), 10, 20);
  if (chance(4 / 7)) add(date, pick(["Chipotle", "Starbucks", "Whataburger"]), "Dining", money(6, 25), 8, 21);
  if (chance(1 / 7)) add(date, pick(["Shell", "QuikTrip"]), "Transport", money(30, 50), 7, 20);
  if (chance(0.1)) add(date, pick(["Amazon", "Target"]), "Shopping", money(15, 120));
  if (chance(0.07)) add(date, pick(["AMC Theatres", "Steam"]), "Entertainment", money(10, 60), 12, 22);
  if (chance(0.04)) add(date, pick(["CVS Pharmacy", "Walgreens"]), "Health", money(8, 40));

  // One-time events
  if (monthDay === "07-03") add(date, "Southwest Airlines", "Travel", 259.8);
  if (monthDay === "07-05") add(date, "Hilton Hotels", "Travel", 145.2);
  if (monthDay === "08-15") add(date, "UT Arlington Tuition", "Education", 2500, 9, 12);
  if (monthDay === "08-20" || monthDay === "01-12") add(date, "UTA Bookstore", "Education", money(60, 200));
  if (monthDay === "10-18") add(date, "uBreakiFix Laptop Repair", "Shopping", 899); // unusual spike
}

// ---------- Save to the database ----------
const client = await pool.connect();
try {
  await client.query("BEGIN"); // all-or-nothing: if anything fails, nothing changes

  const removed = await client.query("DELETE FROM transactions WHERE source = 'seed'");

  // Insert all rows in one query. unnest() turns the arrays into rows.
  // "AT TIME ZONE" treats our times as local time (APP_TIMEZONE).
  await client.query(
    `INSERT INTO transactions (spent_at, merchant, category, amount, source)
     SELECT (t::timestamp AT TIME ZONE $5::text), mer, cat, amt, 'seed'
     FROM unnest($1::text[], $2::text[], $3::text[], $4::numeric[]) AS x(t, mer, cat, amt)`,
    [
      rows.map((r) => r.localTime),
      rows.map((r) => r.merchant),
      rows.map((r) => r.category),
      rows.map((r) => r.amount),
      TZ,
    ],
  );

  await client.query("COMMIT");
  console.log(`🧹 Removed ${removed.rowCount} old seed rows`);
  console.log(
    `✅ Inserted ${rows.length} seed transactions (${start.toISOString().slice(0, 10)} to ${end.toISOString().slice(0, 10)})`,
  );
} catch (err) {
  await client.query("ROLLBACK");
  throw err;
} finally {
  client.release();
  await pool.end();
}
