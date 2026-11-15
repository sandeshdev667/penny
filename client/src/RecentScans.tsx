// "Recent scans": the last few receipts saved from photos.

import { useEffect, useState } from "react";
import { money } from "./format";
import { useLang } from "./lang";

type RecentReceipt = {
  id: number;
  kind: "receipt" | "statement";
  merchant: string; // for a statement: the bank's name
  date: string;
  total: number;
  lines: number; // how many transactions it added
  categories: string[];
};
type RecentData = { receipts: RecentReceipt[]; count: number };

// "Today", "Yesterday", "Dec 11", or "Dec 11, 2025" for other years
function dateLabel(date: string) {
  const d = new Date(date + "T00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((today.getTime() - d.getTime()) / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: d.getFullYear() === today.getFullYear() ? undefined : "numeric",
  });
}

// `refreshKey` changes after each save, which makes this list reload
export default function RecentScans({ refreshKey }: { refreshKey: number }) {
  const { t, cat } = useLang();
  const [data, setData] = useState<RecentData | null>(null);

  useEffect(() => {
    fetch("/api/receipts/recent")
      .then((res) => res.json())
      .then(setData)
      .catch(() => {
        // server unavailable: just keep what we have
      });
  }, [refreshKey]);

  return (
    <aside className="card recent">
      <h2>{t("recentTitle")}</h2>

      {data === null && <p className="muted">Loading…</p>}
      {data?.receipts.length === 0 && <p className="muted">{t("recentEmpty")}</p>}

      <ul className="recent-list">
        {data?.receipts.map((r) => (
          <li key={`${r.kind}-${r.id}`} className="recent-item">
            <div className="recent-row">
              <span className="merchant-name">
                {r.merchant}
                {r.kind === "statement" && <span className="badge-statement">Statement</span>}
              </span>
              <span className="merchant-total">{money(r.total)}</span>
            </div>
            <div className="recent-row">
              {r.kind === "statement" ? (
                <span className="recent-lines">{r.lines} transactions imported</span>
              ) : (
                <span className="recent-tags">
                  {r.categories.map((c) => (
                    <span key={c} className="tag">
                      {cat(c)}
                    </span>
                  ))}
                </span>
              )}
              <span className="recent-date">{dateLabel(r.date)}</span>
            </div>
          </li>
        ))}
      </ul>

      {data && data.count > 0 && (
        <p className="muted recent-count">
          {t("recentCount", { a: data.count, b: data.count === 1 ? "receipt" : "receipts" })}
        </p>
      )}
    </aside>
  );
}
