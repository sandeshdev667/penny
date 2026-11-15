// Bank statement import: Gemini reads a statement PDF, we flag payments and possible duplicates,
// then save only the rows the user ticked.

import { createPartFromBase64 } from "@google/genai";
import { pool } from "./db.js";
import { CATEGORIES, generate, type Category } from "./gemini.js";

const TZ = process.env.APP_TIMEZONE || "America/Chicago";

// purchase / refund / fee = spending (can be imported)
// payment / transfer = money moving that isn't spending (shown, but never imported)
export const ROW_TYPES = ["purchase", "refund", "fee", "payment", "transfer"] as const;
export type RowType = (typeof ROW_TYPES)[number];
export const SPENDING_TYPES: RowType[] = ["purchase", "refund", "fee"];

export type StatementRow = {
  date: string; // "YYYY-MM-DD"
  description: string; // exactly as printed on the statement
  merchant: string; // cleaned up, e.g. "Netflix"
  amount: number; // spending is positive, refunds are negative
  type: RowType;
  category: Category;
};

// ---------- Step 1: Gemini reads the PDF ----------

const statementSchema = {
  type: "object",
  properties: {
    is_statement: { type: "boolean", description: "false if this is not a bank or credit card statement" },
    bank: { type: ["string", "null"], description: "Bank or card name, e.g. 'Chase Freedom'" },
    transactions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          date: { type: "string", description: "Transaction date as YYYY-MM-DD" },
          description: { type: "string", description: "The line exactly as printed" },
          merchant: { type: "string", description: "Clean merchant name a person would say" },
          amount: { type: "number", description: "Positive for purchases, fees and payments; negative for refunds" },
          type: { type: "string", enum: ROW_TYPES },
          category: { type: "string", enum: CATEGORIES },
        },
        required: ["date", "description", "merchant", "amount", "type", "category"],
      },
    },
  },
  required: ["is_statement", "bank", "transactions"],
};

function buildPrompt() {
  const year = new Date().getFullYear();
  return `You are reading a bank or credit card statement (PDF, possibly several pages).

- If this is NOT a bank or credit card statement, set is_statement to false and transactions to [].
- List EVERY transaction line on every page. Skip summary lines (previous/new balance, totals,
  minimum payment due, credit limit, interest rate tables, rewards summaries).
- date: YYYY-MM-DD. If only month/day are printed, use the year of the statement period
  (careful with periods that cross from December into January). If no year at all, assume ${year}.
- description: the line exactly as printed.
- merchant: a clean name, e.g. "Netflix" (not "NETFLIX.COM 866-579-7172 CA"), "Uber" (not "UBER *TRIP HELP.UBER.COM").
- type and amount:
  purchase = buying something -> amount positive.
  refund = money back from a merchant (return, credit, reversal) -> amount NEGATIVE.
  fee = bank fees and interest charges -> amount positive.
  payment = paying off the card ("Payment Thank You", autopay, online payment) -> amount positive.
  transfer = deposits, paychecks, incoming or outgoing transfers between accounts, ATM cash -> amount positive.
- category: best fit from the allowed list. Fees and interest -> Bills & Utilities.
  Streaming and software memberships -> Subscriptions. Restaurants and food delivery -> Dining.`;
}

export async function parseStatement(pdf: Buffer): Promise<{ isStatement: boolean; bank: string | null; rows: StatementRow[] }> {
  const text = await generate(
    [{ role: "user", parts: [createPartFromBase64(pdf.toString("base64"), "application/pdf"), { text: buildPrompt() }] }],
    { responseMimeType: "application/json", responseJsonSchema: statementSchema, temperature: 0 },
    90000, // statements can be long: give Gemini up to 90 seconds per model
  );
  const data = JSON.parse(text) as { is_statement: boolean; bank: string | null; transactions: StatementRow[] };

  // Keep only well-formed rows, and fix anything slightly off
  const rows = (data.transactions ?? [])
    .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date) && Number.isFinite(r.amount) && r.amount !== 0)
    .map((r) => {
      const type: RowType = ROW_TYPES.includes(r.type) ? r.type : "purchase";
      const amount = Math.round(r.amount * 100) / 100;
      return {
        date: r.date,
        description: String(r.description ?? "").trim(),
        merchant: String(r.merchant ?? "").trim() || String(r.description ?? "").trim() || "Unknown",
        // refunds are always negative, everything else positive
        amount: type === "refund" ? -Math.abs(amount) : Math.abs(amount),
        type,
        category: CATEGORIES.includes(r.category) ? r.category : "Other",
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  return { isStatement: Boolean(data.is_statement), bank: data.bank?.trim() || null, rows };
}

// ---------- Step 2: find possible duplicates ----------

// A row is a possible duplicate if something in Penny has the same amount within ±1 day.
// "Something" = a single transaction, or a whole scanned receipt (its parts added up).
// Returns: row index -> what it matched
export async function findDuplicates(rows: StatementRow[]) {
  const spending = rows
    .map((r, idx) => ({ idx, amount: r.amount, day: r.date, type: r.type }))
    .filter((r) => SPENDING_TYPES.includes(r.type));
  const matches = new Map<number, { merchant: string; date: string }>();
  if (spending.length === 0) return matches;

  const result = await pool.query<{ idx: number; merchant: string; day: string }>(
    `WITH rows AS (
       SELECT * FROM jsonb_to_recordset($1::jsonb) AS r(idx int, amount numeric, day date)
     ),
     candidates AS (
       SELECT merchant, (spent_at AT TIME ZONE $2::text)::date AS day, amount
       FROM transactions
       UNION ALL
       SELECT MIN(merchant), MIN(spent_at AT TIME ZONE $2::text)::date, SUM(amount)
       FROM transactions WHERE receipt_id IS NOT NULL
       GROUP BY receipt_id
     )
     SELECT DISTINCT ON (r.idx) r.idx, c.merchant, to_char(c.day, 'YYYY-MM-DD') AS day
     FROM rows r
     JOIN candidates c ON c.amount = r.amount AND c.day BETWEEN r.day - 1 AND r.day + 1
     ORDER BY r.idx, abs(c.day - r.day)`,
    [JSON.stringify(spending), TZ],
  );
  for (const m of result.rows) matches.set(m.idx, { merchant: m.merchant, date: m.day });
  return matches;
}

// ---------- Step 3: save the rows the user ticked ----------

type ImportRow = { date: string; merchant: string; category: Category; amount: number; description?: string };

// Throws an Error with a friendly message if something is wrong
export function validateImport(input: unknown): { fileName: string; bank: string | null; rows: ImportRow[] } {
  const body = input as { file_name?: unknown; bank?: unknown; transactions?: unknown } | undefined;
  if (!body || !Array.isArray(body.transactions) || body.transactions.length === 0) {
    throw new Error("No transactions selected");
  }
  const rows = body.transactions.map((raw, i) => {
    const r = raw as Partial<ImportRow>;
    if (typeof r.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(r.date)) throw new Error(`Row ${i + 1} has an invalid date`);
    const merchant = typeof r.merchant === "string" ? r.merchant.trim() : "";
    if (!merchant) throw new Error(`Row ${i + 1} needs a merchant name`);
    if (!r.category || !CATEGORIES.includes(r.category)) throw new Error(`Row ${i + 1} has an unknown category`);
    if (typeof r.amount !== "number" || !Number.isFinite(r.amount) || r.amount === 0) {
      throw new Error(`Row ${i + 1} has an invalid amount`);
    }
    return { date: r.date, merchant, category: r.category, amount: Math.round(r.amount * 100) / 100, description: r.description };
  });
  return {
    fileName: typeof body.file_name === "string" ? body.file_name.slice(0, 200) : "statement.pdf",
    bank: typeof body.bank === "string" && body.bank.trim() ? body.bank.trim().slice(0, 100) : null,
    rows,
  };
}

// One row in `receipts` for the whole statement (so Recent scans shows it once), plus one transaction per row
export async function saveStatement({ fileName, bank, rows }: ReturnType<typeof validateImport>) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN"); // all-or-nothing

    const saved = await client.query<{ id: string }>("INSERT INTO receipts (raw) VALUES ($1) RETURNING id", [
      JSON.stringify({ kind: "statement", file_name: fileName, bank, rows }),
    ]);
    const statementId = Number(saved.rows[0]!.id);

    // 'csv' is the database's source for bank imports (statements are bank imports too)
    await client.query(
      `INSERT INTO transactions (spent_at, merchant, category, amount, source, receipt_id)
       SELECT ((d::date + time '12:00') AT TIME ZONE $1::text), m, c, a, 'csv', $2
       FROM unnest($3::text[], $4::text[], $5::text[], $6::numeric[]) AS x(d, m, c, a)`,
      [
        TZ,
        statementId,
        rows.map((r) => r.date),
        rows.map((r) => r.merchant),
        rows.map((r) => r.category),
        rows.map((r) => r.amount),
      ],
    );

    await client.query("COMMIT");
    const total = rows.reduce((sum, r) => sum + r.amount, 0);
    return { statement_id: statementId, count: rows.length, total: Math.round(total * 100) / 100 };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
