// Talks to Gemini: sends a receipt photo, gets back structured data.

import { GoogleGenAI, ApiError, createPartFromBase64 } from "@google/genai";
import type { ContentListUnion, GenerateContentConfig } from "@google/genai";

// Must match the CHECK list in sql/schema.sql
export const CATEGORIES = [
  "Groceries",
  "Dining",
  "Transport",
  "Shopping",
  "Health",
  "Bills & Utilities",
  "Entertainment",
  "Subscriptions",
  "Travel",
  "Education",
  "Other",
] as const;
export type Category = (typeof CATEGORIES)[number];

export type ReceiptItem = { name: string; amount: number; category: Category };
export type ParsedReceipt = {
  is_receipt: boolean;
  merchant: string | null;
  date: string | null; // "YYYY-MM-DD"
  time: string | null; // "HH:MM" (24-hour)
  items: ReceiptItem[];
  tax: number | null;
  total: number | null;
};

// The API key is read from .env (loaded by dotenv in index.ts)
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Models to try, in order. If one hits its daily limit (or is too slow), we try the next.
// The free tier gives each model its own daily limit, so a backup keeps the app working.
const MODELS = [
  ...new Set([
    process.env.GEMINI_MODEL || "gemini-3.6-flash", // your choice in .env goes first
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-3.5-flash-lite", // "lite" = smaller and faster; last-resort backups
    "gemini-3.1-flash-lite",
  ]),
];

// The "template" Gemini must follow for its answer (JSON Schema)
const receiptSchema = {
  type: "object",
  properties: {
    is_receipt: { type: "boolean", description: "false if the image is not a purchase receipt" },
    merchant: { type: ["string", "null"], description: "Store name as a person would say it" },
    date: { type: ["string", "null"], description: "Purchase date as YYYY-MM-DD" },
    time: { type: ["string", "null"], description: "Purchase time as HH:MM (24-hour), if printed" },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "Item name, cleaned up to be readable" },
          amount: { type: "number", description: "Final price paid for this line" },
          category: { type: "string", enum: CATEGORIES },
        },
        required: ["name", "amount", "category"],
      },
    },
    tax: { type: ["number", "null"] },
    total: { type: ["number", "null"] },
  },
  required: ["is_receipt", "merchant", "date", "time", "items", "tax", "total"],
};

function buildPrompt() {
  const year = new Date().getFullYear();
  return `You are reading a photo of a shopping receipt.

- If the image is NOT a purchase receipt, set is_receipt to false, items to [], and everything else to null.
- merchant: the store name as a person would say it (e.g. "Walmart", not "WAL*MART SUPERCENTER #1234").
- date: YYYY-MM-DD. If the year is missing or unclear, assume ${year}.
- items: every purchased line. amount = the final price for that line (after quantity).
  Do NOT include subtotal, tax, total, payment, card, or change lines.
  A discount or coupon is a separate item with a negative amount.
  A tip, gratuity, service charge, delivery fee, or bag fee IS an item: include it,
  using the same category as the main purchase (e.g. a restaurant tip -> Dining).
  Goal: the item amounts plus tax should add up to the total.
- category: pick the best fit from the allowed list. Guidance:
  grocery-store food and drinks -> Groceries; restaurant, cafe, or ready-to-eat food -> Dining;
  medicine, pharmacy, vitamins -> Health; gas, parking, rideshare -> Transport;
  books, tuition, school supplies -> Education; household goods, clothes, electronics -> Shopping.
- tax and total: exactly as printed on the receipt (null if not printed).`;
}

// Sends a request to Gemini and returns its text answer.
// Tries each model in MODELS: if one hits its daily limit (429) or is too slow, the next one is tried.
// Shared by receipt scanning and Ask Athena.
export async function generate(
  contents: ContentListUnion,
  config: GenerateContentConfig = {},
  timeoutMs = 20000,
): Promise<string> {
  let lastProblem: "limit" | "slow" = "limit";

  for (const model of MODELS) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents,
        config: { ...config, abortSignal: AbortSignal.timeout(timeoutMs) },
      });
      if (!response.text) throw new Error("Gemini returned an empty answer");
      return response.text;
    } catch (err) {
      // Daily limit reached (429) or too slow -> try the next model. Anything else is a real error.
      if (err instanceof ApiError && err.status === 429) {
        console.warn(`Gemini ${model}: daily limit reached, trying next model`);
        lastProblem = "limit";
      } else if (err instanceof Error && err.name === "AbortError") {
        console.warn(`Gemini ${model}: too slow, trying next model`);
        lastProblem = "slow";
      } else {
        throw err;
      }
    }
  }

  throw new Error(
    lastProblem === "limit"
      ? "Gemini's daily limit is reached. Please try again later."
      : "Gemini is taking too long to answer. Please try again in a minute.",
  );
}

// Sends the photo to Gemini and returns the structured receipt
export async function parseReceipt(image: Buffer, mimeType: string): Promise<ParsedReceipt> {
  const text = await generate(
    [{ role: "user", parts: [createPartFromBase64(image.toString("base64"), mimeType), { text: buildPrompt() }] }],
    {
      responseMimeType: "application/json",
      responseJsonSchema: receiptSchema,
      temperature: 0, // as consistent as possible, no creativity
    },
  );
  return JSON.parse(text) as ParsedReceipt;
}

// Safety check: returns a list of problems (empty list = looks good).
// If there are problems, the app shows the review screen even when auto-save is on.
export function checkReceipt(r: ParsedReceipt): string[] {
  if (!r.is_receipt) return ["This doesn't look like a receipt"];

  const problems: string[] = [];
  if (!r.merchant) problems.push("Store name not found");
  if (!r.date) problems.push("Date not found");
  if (r.items.length === 0) problems.push("No items found");

  if (r.total === null) {
    problems.push("Total not found");
  } else {
    const itemsPlusTax = r.items.reduce((sum, i) => sum + i.amount, 0) + (r.tax ?? 0);
    if (Math.abs(itemsPlusTax - r.total) > 0.02) {
      problems.push(`Items + tax ($${itemsPlusTax.toFixed(2)}) don't match the total ($${r.total.toFixed(2)})`);
    }
  }
  return problems;
}
