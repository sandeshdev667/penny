// The review screen: shows what Gemini read, lets the user fix anything, then save.

import { useState } from "react";
import { CATEGORIES, type Category, type ParsedReceipt } from "./receiptTypes";
import { money } from "./format";

// While editing, amounts are kept as text so you can type freely (e.g. "4." on the way to "4.50")
type EditableItem = { name: string; category: Category; amount: string };

const toText = (n: number | null) => (n === null ? "" : n.toFixed(2));
const toNumber = (s: string) => (s.trim() === "" ? null : Number(s));

// Today's date as "YYYY-MM-DD" in local time (used when the receipt has no date)
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type Props = {
  receipt: ParsedReceipt;
  problems: string[];
  saving: boolean;
  onSave: (final: ParsedReceipt) => void;
  onCancel: () => void;
};

export default function ReceiptReview({ receipt, problems, saving, onSave, onCancel }: Props) {
  // Start the form with Gemini's answer (and sensible defaults for anything missing)
  const [merchant, setMerchant] = useState(receipt.merchant ?? "");
  const [date, setDate] = useState(receipt.date ?? today());
  const [time, setTime] = useState(receipt.time ?? "");
  const [items, setItems] = useState<EditableItem[]>(
    receipt.items.map((i) => ({ name: i.name, category: i.category, amount: toText(i.amount) })),
  );
  const [tax, setTax] = useState(toText(receipt.tax));
  const [total, setTotal] = useState(toText(receipt.total));

  // Change one field of one item
  function updateItem(index: number, changes: Partial<EditableItem>) {
    setItems(items.map((item, i) => (i === index ? { ...item, ...changes } : item)));
  }

  // ---------- Live check: do items + tax add up to the total? ----------
  const amounts = items.map((i) => toNumber(i.amount));
  const badAmount = amounts.some((a) => a === null || Number.isNaN(a));
  const taxNumber = toNumber(tax) ?? 0;
  const itemsPlusTax = amounts.reduce<number>((sum, a) => sum + (a ?? 0), 0) + taxNumber;
  const totalNumber = toNumber(total);
  const addsUp = totalNumber !== null && Math.abs(itemsPlusTax - totalNumber) <= 0.02;

  // What still needs fixing before Save is allowed
  const blockers: string[] = [];
  if (!merchant.trim()) blockers.push("store name");
  if (!date) blockers.push("date");
  if (items.length === 0) blockers.push("at least one item");
  if (badAmount) blockers.push("a valid amount for every item");
  if (Number.isNaN(taxNumber)) blockers.push("a valid tax amount");

  function handleSave() {
    onSave({
      is_receipt: true,
      merchant: merchant.trim(),
      date,
      time: time || null,
      items: items.map((i) => ({ name: i.name.trim(), category: i.category, amount: Number(i.amount) })),
      tax: tax.trim() === "" ? null : taxNumber,
      total: totalNumber,
    });
  }

  return (
    <div className="card review">
      {problems.length > 0 && (
        <div className="alert alert-warning">
          <strong>Gemini wasn't sure about:</strong>
          <ul>
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      {/* ---------- Store, date, time ---------- */}
      <div className="review-header">
        <label className="field field-wide">
          <span>Store</span>
          <input value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="Store name" />
        </label>
        <label className="field">
          <span>Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="field">
          <span>Time (optional)</span>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
      </div>

      {/* ---------- Items ---------- */}
      <div className="review-items">
        <div className="review-row review-row-head">
          <span>Item</span>
          <span>Category</span>
          <span className="num">Amount</span>
          <span />
        </div>
        {items.map((item, i) => (
          <div className="review-row" key={i}>
            <input
              value={item.name}
              onChange={(e) => updateItem(i, { name: e.target.value })}
              placeholder="Item name"
              aria-label="Item name"
            />
            <select
              value={item.category}
              onChange={(e) => updateItem(i, { category: e.target.value as Category })}
              aria-label="Category"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <input
              className="num"
              inputMode="decimal"
              value={item.amount}
              onChange={(e) => updateItem(i, { amount: e.target.value })}
              aria-label="Amount"
            />
            <button
              className="icon-button"
              onClick={() => setItems(items.filter((_, j) => j !== i))}
              aria-label="Remove item"
              title="Remove item"
            >
              ✕
            </button>
          </div>
        ))}
        <button
          className="link-button"
          onClick={() => setItems([...items, { name: "", category: "Other", amount: "" }])}
        >
          + Add item
        </button>
      </div>

      {/* ---------- Tax, total, live check ---------- */}
      <div className="review-totals">
        <label className="field field-inline">
          <span>Tax</span>
          <input className="num" inputMode="decimal" value={tax} onChange={(e) => setTax(e.target.value)} />
        </label>
        <label className="field field-inline">
          <span>Total</span>
          <input className="num" inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} />
        </label>
        <p className={addsUp ? "check-ok" : "check-warn"}>
          {addsUp
            ? "✅ Adds up"
            : `⚠️ Items + tax = ${money(itemsPlusTax)}${totalNumber !== null ? `, total says ${money(totalNumber)}` : ""}`}
        </p>
      </div>

      {/* ---------- Buttons ---------- */}
      {blockers.length > 0 && <p className="muted">To save, please add: {blockers.join(", ")}.</p>}
      <div className="review-actions">
        <button className="button button-secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button className="button" onClick={handleSave} disabled={saving || blockers.length > 0}>
          {saving ? "Saving…" : `Save ${money(itemsPlusTax)}`}
        </button>
      </div>
    </div>
  );
}
