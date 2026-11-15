// Saving a scanned receipt: one row in `receipts`, plus one row per category in `transactions`.

import { pool } from "./db.js";
import { CATEGORIES, type Category, type ParsedReceipt, type ReceiptItem } from "./gemini.js";

const TZ = process.env.APP_TIMEZONE || "America/Chicago";

// ---------- Checking what the app sent us ----------

// Throws an Error with a friendly message if something is missing or wrong
export function validateReceipt(input: unknown): ParsedReceipt {
  const r = input as Partial<ParsedReceipt> | undefined;
  if (!r || typeof r !== "object") throw new Error("No receipt data sent");

  const merchant = typeof r.merchant === "string" ? r.merchant.trim() : "";
  if (!merchant) throw new Error("Please enter the store name");

  if (typeof r.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(r.date)) {
    throw new Error("Please enter a valid date");
  }
  const time = typeof r.time === "string" && /^\d{2}:\d{2}$/.test(r.time) ? r.time : null;

  if (!Array.isArray(r.items) || r.items.length === 0) throw new Error("Please add at least one item");
  const items: ReceiptItem[] = r.items.map((item, i) => {
    if (typeof item?.amount !== "number" || !Number.isFinite(item.amount)) {
      throw new Error(`Item ${i + 1} has an invalid amount`);
    }
    if (!CATEGORIES.includes(item.category)) throw new Error(`Item ${i + 1} has an unknown category`);
    return { name: String(item.name ?? "").trim() || "Item", amount: item.amount, category: item.category };
  });

  const tax = typeof r.tax === "number" && Number.isFinite(r.tax) ? r.tax : null;
  const total = typeof r.total === "number" && Number.isFinite(r.total) ? r.total : null;

  return { is_receipt: true, merchant, date: r.date, time, items, tax, total };
}

// ---------- Grouping items by category, with tax split proportionally ----------

// Example: Groceries $10 + Health $5 + $1.50 tax  ->  Groceries $11.00, Health $5.50
// Works in cents to avoid rounding errors like 0.1 + 0.2 = 0.30000000000000004
export function splitByCategory(items: ReceiptItem[], tax: number | null) {
  const cents = (n: number) => Math.round(n * 100);

  const byCategory = new Map<Category, number>();
  for (const item of items) {
    byCategory.set(item.category, (byCategory.get(item.category) ?? 0) + cents(item.amount));
  }

  const itemsTotal = [...byCategory.values()].reduce((a, b) => a + b, 0);
  const taxCents = cents(tax ?? 0);

  const parts = [...byCategory.entries()].map(([category, amount]) => ({
    category,
    amount: amount + (itemsTotal > 0 ? Math.round((taxCents * amount) / itemsTotal) : 0),
  }));

  // Rounding can leave a cent or two over; give it to the biggest category
  // so the parts always add up exactly to items + tax.
  if (parts.length > 0) {
    const leftover = itemsTotal + taxCents - parts.reduce((a, p) => a + p.amount, 0);
    const biggest = parts.reduce((a, b) => (b.amount > a.amount ? b : a));
    biggest.amount += leftover;
  }

  return parts
    .filter((p) => p.amount !== 0)
    .map((p) => ({ category: p.category, amount: p.amount / 100 }));
}

// ---------- Saving to the database ----------

export async function saveReceipt(final: ParsedReceipt, original: unknown) {
  const parts = splitByCategory(final.items, final.tax);
  const localTime = `${final.date} ${final.time ?? "12:00"}`; // no time on receipt -> noon

  const client = await pool.connect();
  try {
    await client.query("BEGIN"); // all-or-nothing

    // 1. The raw details: what Gemini read AND what the user saved (after any edits)
    const saved = await client.query<{ id: string }>(
      "INSERT INTO receipts (raw) VALUES ($1) RETURNING id",
      [JSON.stringify({ gemini: original ?? null, final })],
    );
    const receiptId = Number(saved.rows[0]!.id);

    // 2. One transaction per category, all linked to this receipt
    await client.query(
      `INSERT INTO transactions (spent_at, merchant, category, amount, source, receipt_id)
       SELECT ($1::timestamp AT TIME ZONE $2::text), $3, cat, amt, 'receipt', $4
       FROM unnest($5::text[], $6::numeric[]) AS x(cat, amt)`,
      [localTime, TZ, final.merchant, receiptId, parts.map((p) => p.category), parts.map((p) => p.amount)],
    );

    await client.query("COMMIT");
    const total = parts.reduce((a, p) => a + p.amount, 0);
    return { receipt_id: receiptId, merchant: final.merchant, total: Math.round(total * 100) / 100, parts };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
