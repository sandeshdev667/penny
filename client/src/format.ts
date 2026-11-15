// Small helpers for showing numbers, shared by all pages.

// Whole dollars, e.g. 1240.5 -> "$1,241" (for charts and summary boxes)
export const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

// Dollars and cents, e.g. 4.5 -> "$4.50" (for receipt items)
export const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });
