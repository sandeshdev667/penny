import { useState } from "react";
import { motion } from "motion/react";
import { EASE } from "./anim";
import { CheckIcon, IslandIcon, ScrollIcon, ShipIcon } from "./icons";
import shipInk from "./assets/ship-ink.png";
import RecentScans from "./RecentScans";
import StatementImport, { type StatementStatus } from "./StatementImport";
import { money } from "./format";
import ReceiptReview from "./ReceiptReview";
import type { ParsedReceipt, SaveResult } from "./receiptTypes";

type ParseResult = { receipt: ParsedReceipt; problems: string[] };

// Where we are in the scanning process
type Status = "idle" | "reading" | "review" | "saving" | "saved" | "error";

// Remembers the "Review before saving" switch on this device.
// (try/catch because some browsers block storage, e.g. private windows)
const REVIEW_KEY = "penny.reviewFirst";
function loadReviewSetting(): boolean {
  try {
    return localStorage.getItem(REVIEW_KEY) !== "off"; // default: ON
  } catch {
    return true;
  }
}

// Each scan step fades in the same way
const enter = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.45, ease: EASE },
};

// While Gemini reads: the ship rocks on a moving wave
function Sailing() {
  return (
    <div className="sailing" aria-hidden>
      <motion.span
        className="sailing-ship"
        animate={{ rotate: [-7, 6, -7], y: [0, -4, 0] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
      >
        <ShipIcon size={56} />
      </motion.span>
      <svg className="sailing-wave" viewBox="0 0 320 20" preserveAspectRatio="none">
        <path
          d="M0 10 Q10 2 20 10 T40 10 T60 10 T80 10 T100 10 T120 10 T140 10 T160 10 T180 10 T200 10 T220 10 T240 10 T260 10 T280 10 T300 10 T320 10"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        />
      </svg>
    </div>
  );
}

// Reads the server's answer; turns error replies into a thrown Error with the server's message
async function readJson<T>(res: Response): Promise<T> {
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Something went wrong");
  return data as T;
}

export default function ScanPage({ onViewDashboard }: { onViewDashboard: () => void }) {
  const [status, setStatus] = useState<Status>("idle");
  const [preview, setPreview] = useState<string | null>(null); // photo preview URL
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [saved, setSaved] = useState<SaveResult | null>(null);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false); // a file is being dragged over the box
  const [reviewFirst, setReviewFirst] = useState(loadReviewSetting);
  const [savedCount, setSavedCount] = useState(0); // goes up after each save, so "Recent scans" reloads
  const [statementStatus, setStatementStatus] = useState<StatementStatus>("idle");
  const statementOpen = statementStatus !== "idle" && statementStatus !== "error"; // hide the receipt box
  const statementTable = statementStatus === "review" || statementStatus === "saving"; // needs the full width

  function changeReviewSetting(on: boolean) {
    setReviewFirst(on);
    try {
      localStorage.setItem(REVIEW_KEY, on ? "on" : "off");
    } catch {
      // storage blocked: the switch still works, it just won't be remembered
    }
  }

  function showError(err: unknown) {
    setStatus("error");
    setError(err instanceof Error ? err.message : "Something went wrong");
  }

  // Saves the receipt to the database
  async function save(final: ParsedReceipt, original: ParsedReceipt) {
    setStatus("saving");
    try {
      const res = await fetch("/api/receipts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receipt: final, original }),
      });
      setSaved(await readJson<SaveResult>(res));
      setStatus("saved");
      setSavedCount((n) => n + 1);
    } catch (err) {
      showError(err);
    }
  }

  // Sends the photo to the server, which asks Gemini to read it
  async function handleFile(file: File) {
    if (file.type && !file.type.startsWith("image/")) {
      showError(new Error("That file isn't an image. Please choose a photo of a receipt."));
      return;
    }

    if (preview) URL.revokeObjectURL(preview); // free the old preview
    setPreview(URL.createObjectURL(file));
    setStatus("reading");
    setError("");
    setParsed(null);
    setSaved(null);

    try {
      const form = new FormData();
      form.append("image", file);
      const res = await fetch("/api/receipts/parse", {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(45000), // give up after 45 seconds
      });
      const result = await readJson<ParseResult>(res);

      if (!result.receipt.is_receipt) {
        throw new Error("That doesn't look like a receipt. Try another photo.");
      }

      // Auto-save only when the switch is OFF and the safety check found no problems
      if (!reviewFirst && result.problems.length === 0) {
        await save(result.receipt, result.receipt);
      } else {
        setParsed(result);
        setStatus("review");
      }
    } catch (err) {
      showError(err);
    }
  }

  function reset() {
    setStatus("idle");
    setParsed(null);
    setSaved(null);
    setError("");
  }

  return (
    <div className="scan-page">
      <div className={`scan-layout ${statementTable ? "scan-layout-wide" : ""}`}>
      <div className="content">
      {/* ---------- The two upload boxes, side by side: receipt photo | bank statement ---------- */}
      {(status === "idle" || status === "error") && (
        <div className="scan-options">
        {/* ---------- Upload box: click it, or drag a photo onto it ---------- */}
        {!statementOpen && (
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
            {/* the ship, gently rocking (bronze line art, no background) */}
            <motion.img
              src={shipInk}
              alt=""
              className="dropzone-art"
              animate={{ y: [0, -5, 0], rotate: [-1.5, 1.5, -1.5] }}
              transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
            />
            <span className="dropzone-title">
              <span className="only-desktop">Drop a receipt photo here</span>
              <span className="only-touch">Scan a receipt</span>
            </span>
            <span className="dropzone-hint">Gemini reads the store, date, items and total.</span>
            <span className="button">
              <span className="only-desktop">Choose photo</span>
              <span className="only-touch">Take photo or choose</span>
            </span>
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
                e.target.value = ""; // lets you pick the same file again
              }}
            />
          </motion.label>
        )}
          <StatementImport
            onStatusChange={setStatementStatus}
            onImported={() => setSavedCount((n) => n + 1)}
            onViewDashboard={onViewDashboard}
          />
        </div>
      )}

      {status === "error" && !statementOpen && <div className="alert alert-error">{error}</div>}

      {/* ---------- Reading / auto-saving: photo preview + spinner ---------- */}
      {(status === "reading" || (status === "saving" && !parsed)) && (
        <motion.div {...enter} className="card reading">
          {preview && <img src={preview} alt="Your receipt" className="receipt-preview" />}
          <div className="reading-text">
            <Sailing />
            <span>{status === "reading" ? "Reading your receipt…" : "Saving…"}</span>
          </div>
        </motion.div>
      )}

      {/* ---------- Review screen ---------- */}
      {(status === "review" || (status === "saving" && parsed)) && parsed && (
        <ReceiptReview
          receipt={parsed.receipt}
          problems={parsed.problems}
          saving={status === "saving"}
          onSave={(final) => save(final, parsed.receipt)}
          onCancel={reset}
        />
      )}

      {/* ---------- Saved! ---------- */}
      {status === "saved" && saved && (
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
            <h2>Saved to the ledger</h2>
          </div>
          <p className="saved-total">
            {saved.merchant} · {money(saved.total)}
          </p>
          <ul className="saved-parts">
            {saved.parts.map((p) => (
              <li key={p.category}>
                <span className="tag">{p.category}</span> {money(p.amount)}
              </li>
            ))}
          </ul>
          <div className="review-actions">
            <button className="button button-secondary" onClick={onViewDashboard}>
              View dashboard
            </button>
            <button className="button" onClick={reset}>
              Scan another
            </button>
          </div>
        </motion.div>
      )}

      {/* ---------- The switch ---------- */}
      {!statementOpen && (
      <label className="switch">
        <input
          type="checkbox"
          checked={reviewFirst}
          onChange={(e) => changeReviewSetting(e.target.checked)}
        />
        <span className="switch-track" />
        <span>Review before saving</span>
      </label>
      )}

      {/* ---------- How it works (only while nothing else is on screen) ---------- */}
      {(status === "idle" || status === "error") && !statementOpen && (
        <section className="how-it-works">
          <h2>How it works</h2>
          <ol>
            <li>
              <span className="how-icon"><ShipIcon /></span>
              <span><strong>Snap or upload</strong> a photo of any receipt</span>
            </li>
            <li>
              <span className="how-icon"><ScrollIcon /></span>
              <span><strong>AI reads every item</strong> and sorts it into a category</span>
            </li>
            <li>
              <span className="how-icon"><IslandIcon /></span>
              <span><strong>Review and save.</strong> Your charts update right away</span>
            </li>
          </ol>
        </section>
      )}

      </div>

      {!statementTable && <RecentScans refreshKey={savedCount} />}
      </div>
    </div>
  );
}
