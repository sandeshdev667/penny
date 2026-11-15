// Ask Athena: turns a question into SQL, runs it safely, and explains the result.

import { pool } from "./db.js";
import { CATEGORIES, generate } from "./gemini.js";

const TZ = process.env.APP_TIMEZONE || "America/Chicago";
const MAX_ROWS = 100; // never send back more rows than this

// One earlier message in the conversation (so follow-up questions make sense)
export type ChatMessage = { role: "user" | "athena"; text: string; sql?: string | null };

export type AthenaAnswer = {
  answer: string;
  sql: string | null;
  columns: string[];
  rows: Record<string, unknown>[];
};

// Today's date in the app's time zone, e.g. "2026-11-14 (Saturday)"
function todayText() {
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "long" }).format(new Date());
  return `${date} (${weekday})`;
}

function historyText(history: ChatMessage[]) {
  if (history.length === 0) return "(no earlier messages)";
  return history
    .map((m) => (m.role === "user" ? `User: ${m.text}` : `Athena: ${m.text}${m.sql ? `\n  (SQL used: ${m.sql})` : ""}`))
    .join("\n");
}

// ---------- Step 1: question -> SQL ----------

const sqlSchema = {
  type: "object",
  properties: {
    sql: {
      type: ["string", "null"],
      description: "One PostgreSQL SELECT query that answers the question, or null if no query is needed",
    },
    reply: {
      type: ["string", "null"],
      description: "A short direct reply, ONLY when sql is null (greetings, questions not about spending)",
    },
  },
  required: ["sql", "reply"],
};

function sqlPrompt(question: string, history: ChatMessage[]) {
  return `You are Athena, the assistant inside Penny, a personal spending app. You write PostgreSQL (TimescaleDB) queries.

DATABASE (the only table you may use):
  transactions(
    spent_at   timestamptz,   -- when the purchase happened
    merchant   text,          -- store name, e.g. 'Walmart', 'Netflix'
    category   text,          -- exactly one of: ${CATEGORIES.map((c) => `'${c}'`).join(", ")}
    amount     numeric,       -- dollars spent (positive)
    source     text,          -- 'receipt', 'csv', or 'seed' (ignore unless asked)
    receipt_id bigint         -- links rows from the same scanned receipt
  )
  A scanned receipt can be split into several rows (one per category) with the same receipt_id.

RULES:
- Write ONE read-only SELECT (a WITH ... SELECT is fine). Never modify data.
- Dates and times: the user lives in ${TZ}. Use (spent_at AT TIME ZONE '${TZ}') for any date logic.
  Today is ${todayText()}. "This month" = the current calendar month so far.
- TimescaleDB's time_bucket() is available for grouping by day/week/month.
- Make results easy to read: give columns clear names (e.g. total_spent, month),
  round money with ROUND(x, 2), format dates with to_char (e.g. to_char(..., 'Mon YYYY')).
- Match merchant names loosely with ILIKE (e.g. merchant ILIKE '%starbucks%').
- Keep results small: aggregate when possible, and add ORDER BY and LIMIT for lists.
- If the question is not about the user's spending (e.g. "hi", "who are you"), set sql to null
  and put a short friendly reply in reply.

CONVERSATION SO FAR:
${historyText(history)}

NEW QUESTION: ${question}`;
}

// ---------- Step 2: run the SQL safely ----------

// Basic checks before we even send the query to the database
function checkSql(sql: string): string {
  const cleaned = sql.trim().replace(/;\s*$/, ""); // allow one trailing semicolon
  if (cleaned.includes(";")) throw new Error("Only one query is allowed");
  if (!/^(select|with)\b/i.test(cleaned)) throw new Error("Only SELECT queries are allowed");
  return cleaned;
}

export async function runReadOnly(sql: string) {
  const safeSql = checkSql(sql);
  const client = await pool.connect();
  try {
    // READ ONLY: the database itself refuses any INSERT/UPDATE/DELETE/DROP inside this transaction
    await client.query("BEGIN READ ONLY");
    await client.query("SET LOCAL statement_timeout = '5s'"); // stop slow queries
    const result = await client.query(`SELECT * FROM (${safeSql}) AS athena_result LIMIT ${MAX_ROWS}`);
    return { columns: result.fields.map((f) => f.name), rows: result.rows as Record<string, unknown>[] };
  } finally {
    await client.query("ROLLBACK").catch(() => {}); // end the transaction; nothing to keep anyway
    client.release();
  }
}

// ---------- Step 3: result -> friendly sentence ----------

function answerPrompt(question: string, history: ChatMessage[], sql: string, rows: Record<string, unknown>[]) {
  return `You are Athena, a friendly, wise assistant inside Penny, a personal spending app.

CONVERSATION SO FAR:
${historyText(history)}

The user asked: ${question}
This query was run: ${sql}
It returned ${rows.length} row(s): ${JSON.stringify(rows.slice(0, 50))}

Answer the question in 1-3 short sentences using ONLY these results.
Format money like $1,234.56. If there are no rows, say no matching spending was found.
Plain text only, no markdown, no SQL.`;
}

// ---------- The whole flow ----------

export async function askAthena(question: string, history: ChatMessage[]): Promise<AthenaAnswer> {
  const recent = history.slice(-6); // the last few messages are enough for follow-ups

  const plan = JSON.parse(
    await generate(sqlPrompt(question, recent), {
      responseMimeType: "application/json",
      responseJsonSchema: sqlSchema,
      temperature: 0,
    }),
  ) as { sql: string | null; reply: string | null };

  // No query needed (e.g. "hi"): one Gemini request instead of two
  if (!plan.sql) {
    return { answer: plan.reply || "I can answer questions about your spending.", sql: null, columns: [], rows: [] };
  }

  let data;
  try {
    data = await runReadOnly(plan.sql);
  } catch (err) {
    console.warn("Athena query failed:", err instanceof Error ? err.message : err, "\nSQL:", plan.sql);
    return {
      answer: "I couldn't work that out from your data. Could you rephrase the question?",
      sql: plan.sql,
      columns: [],
      rows: [],
    };
  }

  const answer = await generate(answerPrompt(question, recent, plan.sql, data.rows), { temperature: 0.3 });
  return { answer: answer.trim(), sql: plan.sql, ...data };
}
