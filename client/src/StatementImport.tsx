// Bank statement import (on the Scan page):
// upload a PDF -> Gemini reads every transaction -> review table -> import the ticked rows.

import { useState } from "react";
import { motion } from "motion/react";
import { EASE } from "./anim";
import { money } from "./format";
import { CheckIcon, ShipIcon } from "./icons";
import scrollInk from "./assets/scroll-ink.svg";
import { CATEGORIES, type Category } from "./receiptTypes";

type RowType = "purchase" | "refund" | "fee" | "payment" | "transfer";
type ParsedRow = {
  date: string; // "YYYY-MM-DD"
  description: string; // as printed on the statement
  merchant: string;
  amount: number; // refunds are negative
  type: RowType;
  category: Category;
  duplicate: { merchant: string; date: string } | null; // something in Penny that looks the same
};
type Row = ParsedRow & { selected: boolean };
export type StatementStatus = "idle" | "reading" | "review" | "saving" | "done" | "error";
type Status = StatementStatus;

// Payments and transfers aren't spending, so they can never be imported
const isSpending = (r: ParsedRow) => r.type === "purchase" || r.type === "refund" || r.type === "fee";

// "2026-10-16" -> "Oct 16"
const shortDate = (date: string) =>
  new Date(date + "T00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

// Refunds show as "−$24.99"
const signedMoney = (n: number) => (n < 0 ? `−${money(-n)}` : money(n));

async function readJson<T>(res: Response): Promise<T> {
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Something went wrong");
  return data as T;
}

const enter = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.45, ease: EASE },
};

type Props = {
  onStatusChange: (status: Status) => void; // the Scan page hides the receipt box while this is open
  onImported: () => void; // so "Recent scans" reloads
  onViewDashboard: () => void;
};

export default function StatementImport({ onStatusChange, onImported, onViewDashboard }: Props) {
  const [status, setStatusRaw] = useState<Status>("idle");
  const [fileName, setFileName] = useState("");
  const [bank, setBank] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ count: number; total: number } | null>(null);
  const [dragging, setDragging] = useState(false); // a file is being dragged over the box

  function setStatus(next: Status) {
    setStatusRaw(next);
    onStatusChange(next);
  }

  // ---------- Upload and read ----------
  async function handleFile(file: File) {
    if (file.type && file.type !== "application/pdf") {
      setError("That file isn't a PDF. Please choose a statement PDF.");
      setStatus("error");
      return;
    }
    setFileName(file.name);
    setError("");
    setStatus("reading");
    try {
      const form = new FormData();
      form.append("statement", file);
      const res = await fetch("/api/statements/parse", {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(180000), // long statements can take a while
      });
      const data = await readJson<{ bank: string | null; transactions: ParsedRow[] }>(res);
      setBank(data.bank);
      // Ticked to start with: spending that isn't a possible duplicate
      setRows(data.transactions.map((r) => ({ ...r, selected: isSpending(r) && !r.duplicate })));
      setStatus("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setStatus("error");
    }
  }

  // ---------- Editing the table ----------
  function updateRow(index: number, changes: Partial<Row>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...changes } : r)));
  }

  const selectable = rows.filter(isSpending);
  const selected = rows.filter((r) => r.selected);
  const selectedTotal = selected.reduce((sum, r) => sum + r.amount, 0);
  const allSelected = selectable.length > 0 && selectable.every((r) => r.selected);
  const missingName = selected.some((r) => !r.merchant.trim());

  function toggleAll() {
    setRows((prev) => prev.map((r) => (isSpending(r) ? { ...r, selected: !allSelected } : r)));
  }

  // ---------- Import ----------
  async function importRows() {
    setStatus("saving");
    try {
      const res = await fetch("/api/statements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file_name: fileName,
          bank,
          transactions: selected.map((r) => ({
            date: r.date,
            merchant: r.merchant.trim(),
            category: r.category,
            amount: r.amount,
            description: r.description,
          })),
        }),
      });
      setResult(await readJson<{ count: number; total: number }>(res));
      setStatus("done");
      onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setStatus("review"); // keep the table so nothing is lost
    }
  }

  function reset() {
    setRows([]);
    setResult(null);
    setError("");
    setStatus("idle");
  }

  // ---------- Screens ----------

  if (status === "idle" || status === "error") {
    // Same look as the receipt photo box: click it, or drag a PDF onto it
    return (
      <motion.label
        {...enter}
        className={`dropzone card ${dragging ? "dragging" : ""}`}
        onDragOver={(e) => {
          e.preventDefault(); // needed so the browser allows dropping
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) handleFile(file);
        }}
      >
        {/* an unrolled scroll, gently floating (same bronze line art as the ship) */}
        <motion.img
          src={scrollInk}
          alt=""
          className="dropzone-art"
          animate={{ y: [0, -5, 0], rotate: [1, -1, 1] }}
          transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut" }}
        />
        <span className="dropzone-title">Import a bank statement</span>
        <span className="dropzone-hint">Gemini reads every transaction from a PDF, from any bank or card.</span>
        <span className="button">Choose statement PDF</span>
        {status === "error" && <span className="alert alert-error dropzone-error">{error}</span>}
        <input
          type="file"
          accept="application/pdf"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = ""; // lets you pick the same file again
          }}
        />
      </motion.label>
    );
  }

  if (status === "reading") {
    return (
      <motion.div {...enter} className="card reading">
        <div className="reading-text">
          <motion.span
            className="statement-reading-ship"
            animate={{ rotate: [-7, 6, -7], y: [0, -4, 0] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
          >
            <ShipIcon size={52} />
          </motion.span>
          <span>Reading every line of {fileName}…</span>
          <span className="statement-hint">Long statements can take up to a minute.</span>
        </div>
      </motion.div>
    );
  }

  if (status === "done" && result) {
    return (
      <motion.div {...enter} className="card saved">
        <div className="saved-head">
          <motion.span
            className="saved-check"
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 320, damping: 18, delay: 0.1 }}
          >
            <CheckIcon size={22} />
          </motion.span>
          <h2>Statement imported</h2>
        </div>
        <p className="saved-total">
          {result.count} {result.count === 1 ? "transaction" : "transactions"} · {signedMoney(result.total)}
        </p>
        <div className="review-actions">
          <button className="button button-secondary" onClick={onViewDashboard}>
            View dashboard
          </button>
          <button className="button" onClick={reset}>
            Done
          </button>
        </div>
      </motion.div>
    );
  }

  // review / saving
  const saving = status === "saving";
  return (
    <motion.div {...enter} className="card statement-review">
      <div className="statement-head">
        <div>
          <h2>{bank ?? "Bank statement"}</h2>
          <p className="muted">
            {rows.length} transactions found in {fileName}. Untick anything you don't want to import.
          </p>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="statement-table" role="table">
        <div className="statement-row statement-row-head" role="row">
          <span>
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              disabled={saving || selectable.length === 0}
              aria-label="Select all"
            />
          </span>
          <span>Date</span>
          <span>Merchant</span>
          <span>Category</span>
          <span className="num">Amount</span>
        </div>

        {rows.map((r, i) => {
          const spending = isSpending(r);
          return (
            <div
              key={i}
              role="row"
              className={`statement-row ${spending ? "" : "is-payment"} ${r.selected ? "is-selected" : ""}`}
            >
              <span>
                <input
                  type="checkbox"
                  checked={r.selected}
                  disabled={!spending || saving}
                  onChange={(e) => updateRow(i, { selected: e.target.checked })}
                  aria-label={`Import ${r.merchant}`}
                />
              </span>
              <span className="statement-date">{shortDate(r.date)}</span>
              <span className="statement-merchant">
                <input
                  value={r.merchant}
                  onChange={(e) => updateRow(i, { merchant: e.target.value })}
                  disabled={!spending || saving}
                  title={r.description}
                  aria-label="Merchant"
                />
                {!spending && (
                  <span className="statement-note">
                    {r.type === "payment" ? "Payment" : "Transfer"} · not spending, won't be imported
                  </span>
                )}
                {spending && r.duplicate && (
                  <span className="statement-note statement-dup">
                    Already in Penny: {r.duplicate.merchant} on {r.duplicate.date}
                  </span>
                )}
              </span>
              <span>
                <select
                  value={r.category}
                  onChange={(e) => updateRow(i, { category: e.target.value as Category })}
                  disabled={!spending || saving}
                  aria-label="Category"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </span>
              <span className={`num statement-amount ${r.amount < 0 ? "is-refund" : ""}`}>
                {signedMoney(r.amount)}
              </span>
            </div>
          );
        })}
      </div>

      {/* footer: what will be imported */}
      <div className="statement-foot">
        <span className="statement-summary">
          <strong>{selected.length} selected</strong> · {signedMoney(selectedTotal)}
        </span>
        {missingName && <span className="check-warn">Every selected row needs a merchant name.</span>}
        <div className="review-actions">
          <button className="button button-secondary" onClick={reset} disabled={saving}>
            Cancel
          </button>
          <button className="button" onClick={importRows} disabled={saving || selected.length === 0 || missingName}>
            {saving ? "Importing…" : `Import ${selected.length} ${selected.length === 1 ? "transaction" : "transactions"}`}
          </button>
        </div>
      </div>
    </motion.div>
  );
}
