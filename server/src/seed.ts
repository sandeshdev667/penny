// Fills the transactions table with ~8 months of realistic fake purchases for the demo.
// Persona: a college student in Arlington, Texas (UTA).
// Run with: npm run db:seed
// Safe to re-run: it deletes old seed rows first (real receipt/statement rows are never touched).

import "dotenv/config";
import { pool } from "./db.js";

const TZ = process.env.APP_TIMEZONE || "America/Chicago";
const MONTHS = 8;

// ---------- Random helpers ----------
// A "seeded" random generator: it gives the SAME sequence every run,
// so the demo data looks the same each time we re-seed.
let seed = 2026;
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
function add(date: string, merchant: string, category: string, amount: number, fromHour = 9, toHour = 21) {
  const hour = fromHour + Math.floor(rand() * Math.max(1, toHour - fromHour));
  const minute = Math.floor(rand() * 60);
  rows.push({ localTime: `${date} ${pad(hour)}:${pad(minute)}`, merchant, category, amount });
}

// Date range: 8 months ago -> yesterday (today stays empty for the live receipt demo)
const today = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date()); // "YYYY-MM-DD"
const [y, m, d] = today.split("-").map(Number) as [number, number, number];
const start = new Date(Date.UTC(y, m - 1 - MONTHS, d));
const end = new Date(Date.UTC(y, m - 1, d - 1));

// One-time events, by "MM-DD". They only appear if that day is inside the date range.
const EVENTS: Record<string, [merchant: string, category: string, amount: number][]> = {
  // March: spring break at South Padre Island
  "03-15": [["Southwest Airlines", "Travel", 287.4]],
  "03-16": [["Airbnb", "Travel", 342.0]],
  "03-17": [["Dirty Al's Seafood", "Dining", 38.5], ["Island Beach Rentals", "Entertainment", 45.0]],
  "03-18": [["Gabriel's Mexican Grill", "Dining", 27.8]],
  // April / May
  "04-12": [["UTA Parking Services", "Transport", 35.0]],
  "05-08": [["1-800-Flowers", "Shopping", 54.99]],
  "05-10": [["Ticketmaster", "Entertainment", 145.0]],
  // June: summer trip to Denver
  "06-19": [["Delta Air Lines", "Travel", 312.8]],
  "06-20": [["Marriott Denver", "Travel", 189.0]],
  "06-21": [["Marriott Denver", "Travel", 189.0], ["Red Rocks Amphitheatre", "Entertainment", 78.5]],
  // July
  "07-03": [["Costco", "Groceries", 128.45]],
  "07-12": [["Six Flags Over Texas", "Entertainment", 89.99]],
  // August: back to school (the big month)
  "08-10": [["Best Buy", "Shopping", 129.99]],
  "08-15": [["UT Arlington Tuition", "Education", 2500.0]],
  "08-18": [["UTA Bookstore", "Education", 186.45]],
  "08-20": [["Amazon", "Education", 64.2]],
  // October: Halloween and one unusual expense
  "10-18": [["uBreakiFix Laptop Repair", "Shopping", 899.0]],
  "10-28": [["Spirit Halloween", "Shopping", 46.8]],
  "10-31": [["Party City", "Shopping", 22.15]],
  // November: Thanksgiving flight and early holiday shopping
  "11-01": [["Southwest Airlines", "Travel", 198.4]],
  "11-07": [["Target", "Shopping", 84.3]],
  "11-10": [["Amazon", "Shopping", 112.6]],
};

for (const day = new Date(start); day <= end; day.setUTCDate(day.getUTCDate() + 1)) {
  const date = day.toISOString().slice(0, 10); // "2026-08-15"
  const dayOfMonth = day.getUTCDate();
  const month = day.getUTCMonth() + 1; // 1-12
  const weekday = day.getUTCDay(); // 0 = Sunday ... 6 = Saturday
  const weekend = weekday === 0 || weekday === 6;
  const summer = month >= 6 && month <= 9;

  // ---- Monthly bills and subscriptions (same day every month) ----
  if (dayOfMonth === 1) add(date, "Campus Edge Apartments", "Bills & Utilities", 750, 8, 9);
  if (dayOfMonth === 3) add(date, "State Farm Insurance", "Bills & Utilities", 112.4, 8, 9);
  if (dayOfMonth === 5) {
    add(date, "T-Mobile", "Bills & Utilities", 45, 8, 9);
    add(date, "Spectrum Internet", "Bills & Utilities", money(38, 42), 8, 9);
  }
  if (dayOfMonth === 8) add(date, "Planet Fitness", "Health", 24.99, 6, 7);
  if (dayOfMonth === 12) add(date, "Netflix", "Subscriptions", 15.49, 6, 7);
  if (dayOfMonth === 15) add(date, "Apple iCloud+", "Subscriptions", 2.99, 6, 7);
  if (dayOfMonth === 20) add(date, "Spotify", "Subscriptions", month >= 8 ? 12.99 : 11.99, 6, 7); // price went up in August
  if (dayOfMonth === 22) add(date, "TXU Energy", "Bills & Utilities", summer ? money(95, 140) : money(55, 80), 8, 9); // A/C in summer

  // ---- Everyday spending (random, with a weekly rhythm) ----
  // Coffee before class on weekdays
  if (!weekend && chance(0.55)) add(date, pick(["Starbucks", "Dutch Bros Coffee", "Ascension Coffee"]), "Dining", money(4.5, 7.5), 7, 10);
  // Lunch on campus days
  if (!weekend && chance(0.35)) add(date, pick(["Chipotle", "Chick-fil-A", "Subway", "Panda Express"]), "Dining", money(9, 15), 11, 14);
  // Dinner out: mostly weekends
  if (chance(weekend ? 0.55 : 0.15)) {
    add(date, pick(["Whataburger", "Torchy's Tacos", "Raising Cane's", "Olive Garden", "Pho Hot Pot"]), "Dining", money(12, 45), 18, 22);
  }
  // Food delivery on some weeknights
  if (!weekend && chance(0.07)) add(date, "DoorDash", "Dining", money(18, 35), 19, 22);
  // Groceries: a big weekend trip, sometimes a quick weekday stop
  if (weekend && chance(0.6)) add(date, pick(["H-E-B", "Walmart", "H-E-B", "Kroger"]), "Groceries", money(45, 110), 10, 18);
  if (!weekend && chance(0.12)) add(date, pick(["Kroger", "Walmart", "7-Eleven"]), "Groceries", money(8, 30), 16, 21);
  // Gas about once a week
  if (chance(1 / 6)) add(date, pick(["Shell", "QuikTrip", "Buc-ee's"]), "Transport", money(32, 55), 7, 20);
  // Rideshare home on weekend nights
  if (weekend && chance(0.15)) add(date, pick(["Uber", "Lyft"]), "Transport", money(9, 24), 21, 23);
  // Shopping, fun, and the pharmacy now and then
  if (chance(0.08)) add(date, pick(["Amazon", "Target", "Walmart"]), "Shopping", money(12, 90));
  if (weekend && chance(summer ? 0.18 : 0.1)) add(date, pick(["AMC Theatres", "Steam", "Main Event", "Topgolf"]), "Entertainment", money(10, 55), 13, 22);
  if (chance(0.03)) add(date, pick(["CVS Pharmacy", "Walgreens"]), "Health", money(7, 35));

  // ---- One-time events ----
  for (const [merchant, category, amount] of EVENTS[date.slice(5)] ?? []) add(date, merchant, category, amount);
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
