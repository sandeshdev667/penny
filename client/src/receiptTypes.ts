// Shared receipt types and the category list (must match server/src/gemini.ts and sql/schema.sql)

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
  time: string | null; // "HH:MM"
  items: ReceiptItem[];
  tax: number | null;
  total: number | null;
};

// What the server sends back after saving
export type SaveResult = {
  receipt_id: number;
  merchant: string;
  total: number;
  parts: { category: Category; amount: number }[];
};
