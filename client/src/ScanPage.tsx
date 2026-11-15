import { useState } from "react";
import shipIcon from "./assets/voyage.png";
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
    <div className="content scan-page">
      {/* ---------- Upload box: click it, or drag a photo onto it ---------- */}
      {(status === "idle" || status === "error") && (
        <label
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
          <img src={shipIcon} alt="" className="dropzone-icon" />
          <span className="dropzone-title">
            <span className="only-desktop">Drop a receipt photo here</span>
            <span className="only-touch">Scan a receipt</span>
          </span>
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
        </label>
      )}

      {status === "error" && <div className="alert alert-error">{error}</div>}

      {/* ---------- Reading / auto-saving: photo preview + spinner ---------- */}
      {(status === "reading" || (status === "saving" && !parsed)) && (
        <div className="card reading">
          {preview && <img src={preview} alt="Your receipt" className="receipt-preview" />}
          <div className="reading-text">
            <div className="spinner" />
            <span>{status === "reading" ? "Reading your receipt…" : "Saving…"}</span>
          </div>
        </div>
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
        <div className="card saved">
          <h2>✅ Saved</h2>
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
        </div>
      )}

      {/* ---------- The switch ---------- */}
      <label className="switch">
        <input
          type="checkbox"
          checked={reviewFirst}
          onChange={(e) => changeReviewSetting(e.target.checked)}
        />
        <span className="switch-track" />
        <span>Review before saving</span>
      </label>
    </div>
  );
}
