// The app's two ways of speaking: "old times" (the age of Odysseus) and plain modern English.
// Every piece of text lives here once, in both versions. The switch is in the sidebar.

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

// [old times, modern]. {a}, {b}, {c} are filled in by t().
const WORDS = {
  // sidebar and page titles
  navDashboard: ["The Treasury", "Dashboard"],
  navScan: ["The Harbor", "Scan Receipt"],
  navAthena: ["Ask Athena", "Ask Athena"],
  brandSub: ["Ledger of the voyage", "Spending tracker"],
  dashEyebrow: ["The ledger", "Overview"],
  dashTitle: ["Where the money sailed", "Where your money went"],
  scanEyebrow: ["Bring it home", "Add spending"],
  scanTitle: ["Unload your cargo", "Scan a receipt"],
  langOld: ["Old times", "Old times"],
  langNew: ["Newer", "Newer"],

  // dashboard
  thisSoFar: ["This moon so far", "This month so far"],
  dayLine: ["Day {a} of {b} of the moon", "Day {a} of {b}"],
  paceLine: [" · at this pace, about {a} by its end", " · on pace for about {a}"],
  lastPeriod: ["Last moon", "Last month"],
  greatest: ["Greatest cost", "Top category"],
  tributes: ["Tributes", "Recurring"],
  meterCaption: ["{a}% of last moon's cost spent · {b}% of the moon gone", "{a}% of last month's total spent · {b}% of the month gone"],
  spendByPeriod: ["Spending by moon", "Spending by month"],
  legendFull: ["full moon", "full month"],
  byCategory: ["By kind of cargo", "By category"],
  merchantsTitle: ["Favoured merchants", "Top merchants"],
  merchantsNote: ["everyday trade", "everyday spending"],
  recurringTitle: ["Tributes that return", "Recurring charges"],
  recurringNone: ["No returning tributes found yet.", "No regular charges found yet."],

  // scan page
  dropTitle: ["Lay your receipt here", "Drop a receipt photo here"],
  dropTouch: ["Show your receipt", "Scan a receipt"],
  dropHint: ["The scribes read the merchant, the day, the wares and the sum.", "Gemini reads the store, date, items and total."],
  choosePhoto: ["Choose a photo", "Choose photo"],
  reviewSwitch: ["Check the tally before sealing", "Review before saving"],
  how1: ["Show a receipt", "Snap or upload"],
  how1r: [" to the scribes (a photo will do)", " a photo of any receipt"],
  how2: ["The scribes read each item", "AI reads every item"],
  how2r: [" and sort it by kind", " and sorts it into a category"],
  how3: ["Confirm and seal it.", "Review and save."],
  how3r: [" Your treasury is updated at once", " Your charts update right away"],
  savedTitle: ["Sealed in the ledger", "Saved to the ledger"],
  toDash: ["To the treasury", "View dashboard"],
  another: ["Another receipt", "Scan another"],
  reading: ["The scribes are reading your receipt…", "Reading your receipt…"],
  saving: ["Sealing…", "Saving…"],
  recentTitle: ["Recent deliveries", "Recent scans"],
  recentEmpty: ["Nothing delivered yet. Your first receipt will appear here.", "No receipts yet. Your first scan will show up here."],
  recentCount: ["{a} {b} delivered so far", "{a} {b} scanned so far"],

  // review screen
  unsure: ["The scribes were unsure about:", "Gemini wasn't sure about:"],
  sealAmount: ["Seal {a}", "Save {a}"],

  // bank statement
  stmtTitle: ["Bring a bank scroll", "Import a bank statement"],
  stmtHint: ["The scribes read every coin that left your purse (a PDF from any bank or card).", "Gemini reads every transaction from a PDF, from any bank or card."],
  stmtBtn: ["Choose the statement PDF", "Choose statement PDF"],
  stmtReading: ["The scribes are reading every line of {a}…", "Reading every line of {a}…"],
  stmtDone: ["Scroll read and sealed", "Statement imported"],
  stmtImport: ["Seal {a} {b}", "Import {a} {b}"],
  stmtImporting: ["Sealing…", "Importing…"],
  entry: ["entry", "transaction"],
  entries: ["entries", "transactions"],

  // Athena
  askTitle: ["What would you ask, traveller?", "What would you like to know?"],
  askSub: ["Speak of your coin and your voyage. Athena reads the ledger and answers.", "Ask about your spending in plain English. Athena looks it up in your receipts."],
  askPlaceholder: ["Speak to Athena of your coin…", "Ask Athena about your spending…"],
  askNote: ["Even the gods err. Check the sums that matter.", "Athena can make mistakes. Double-check important numbers."],
  askSubtitle: ["reads only your own ledger", "answers from your own spending"],

  // category toggle
  allTime: ["All time", "All time"],
  byMonth: ["By moon", "By month"],

  // the 3D voyage
  voyTitle: ["The Voyage", "Your journey"],
  voyNote: ["sail from moon to moon", "sail from month to month"],
  voyLoading: ["The ship is being readied…", "Loading the 3D view…"],
  voyHint: ["Drag to look around · ← → or the arrows to sail", "Drag to look around · ← → or the arrows to sail"],
  coinLegend: ["Each gold coin is {a}", "Each gold coin = {a}"],
  sailingTo: ["Sailing to {a}…", "Sailing to {a}…"],
  moonTotal: ["{a} spent this moon", "{a} spent this month"],
  soFar: [" (so far)", " (so far)"],
  nothingSpent: ["An empty isle: nothing spent this moon.", "No spending this month."],
  prevMoon: ["Previous moon", "Previous month"],
  nextMoon: ["Next moon", "Next month"],
  noWebgl: ["Your browser cannot show the 3D voyage.", "Your browser can't show the 3D view."],
} as const;

export type WordKey = keyof typeof WORDS;

// Display names for categories (the database stores the plain ones)
const CATEGORY_OLD: Record<string, string> = {
  Groceries: "Provisions",
  Dining: "Feasts",
  Transport: "Voyages",
  Shopping: "Market Wares",
  Health: "Remedies",
  "Bills & Utilities": "Hearth & Dues",
  Entertainment: "Games & Song",
  Subscriptions: "Returning Tributes",
  Travel: "Far Shores",
  Education: "Lessons",
  Other: "Sundries",
};

type Lang = {
  ancient: boolean; // true = old times
  setAncient: (on: boolean) => void;
  t: (key: WordKey, vars?: { a?: string | number; b?: string | number; c?: string | number }) => string;
  cat: (category: string) => string; // "Groceries" -> "Provisions" (old times) or "Groceries" (modern)
};

const LangContext = createContext<Lang | null>(null);

const STORAGE_KEY = "penny.language";
function load(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "modern"; // default: old times
  } catch {
    return true;
  }
}

export function LangProvider({ children }: { children: ReactNode }) {
  const [ancient, setAncientState] = useState(load);

  const value = useMemo<Lang>(() => {
    const setAncient = (on: boolean) => {
      setAncientState(on);
      try {
        localStorage.setItem(STORAGE_KEY, on ? "ancient" : "modern");
      } catch {
        // storage blocked: it still switches for this visit
      }
    };
    return {
      ancient,
      setAncient,
      t: (key, vars = {}) =>
        WORDS[key][ancient ? 0 : 1]
          .replace("{a}", String(vars.a ?? ""))
          .replace("{b}", String(vars.b ?? ""))
          .replace("{c}", String(vars.c ?? "")),
      cat: (category) => (ancient ? (CATEGORY_OLD[category] ?? category) : category),
    };
  }, [ancient]);

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useLang(): Lang {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useLang must be used inside <LangProvider>");
  return ctx;
}
