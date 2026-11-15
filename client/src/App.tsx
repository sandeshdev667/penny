import { useState } from "react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import Landing from "./Landing";
import Dashboard from "./Dashboard";
import ScanPage from "./ScanPage";
import AthenaPage from "./AthenaPage";
import { useAthenaChat } from "./useAthenaChat";
import { useLang, type WordKey } from "./lang";
import AxesLine from "./AxesLine";
import { EASE } from "./anim";
import { CameoIcon, ShipIcon, TempleIcon } from "./icons";
import pennyMark from "./assets/penny-mark.svg";

// The pages in the sidebar (eyebrow = the small line above each page title)
type Page = "dashboard" | "scan" | "athena";
const PAGES: { id: Page; label: WordKey; Icon: typeof TempleIcon; eyebrow: WordKey; title: WordKey }[] = [
  { id: "dashboard", label: "navDashboard", Icon: TempleIcon, eyebrow: "dashEyebrow", title: "dashTitle" },
  { id: "scan", label: "navScan", Icon: ShipIcon, eyebrow: "scanEyebrow", title: "scanTitle" },
  { id: "athena", label: "navAthena", Icon: CameoIcon, eyebrow: "navAthena", title: "navAthena" },
];

// Remember (for this browser tab) that the user already went past the landing page,
// so refreshing doesn't replay the intro. try/catch: some browsers block storage.
const ENTERED_KEY = "penny.entered";
function loadEntered() {
  try {
    return sessionStorage.getItem(ENTERED_KEY) === "yes";
  } catch {
    return false;
  }
}
function saveEntered(yes: boolean) {
  try {
    sessionStorage.setItem(ENTERED_KEY, yes ? "yes" : "no");
  } catch {
    // storage blocked: fine, the intro just plays again on refresh
  }
}

// Remember (on this device) whether the sidebar is collapsed
const SIDEBAR_KEY = "penny.sidebarCollapsed";
function loadCollapsed() {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === "yes";
  } catch {
    return false;
  }
}

export default function App() {
  const [entered, setEntered] = useState(loadEntered); // false = show the landing page
  const [page, setPage] = useState<Page>("dashboard"); // which page is showing right now
  const current = PAGES.find((p) => p.id === page)!;
  // the Ask Athena conversation lives here, so it survives switching pages
  const { t, ancient, setAncient } = useLang();
  const athenaChat = useAthenaChat(ancient ? "ancient" : "modern");
  const [collapsed, setCollapsed] = useState(loadCollapsed); // sidebar shows icons only

  function toggleSidebar() {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(SIDEBAR_KEY, next ? "yes" : "no");
    } catch {
      // storage blocked: it still works, it just won't be remembered
    }
  }

  // "Start scanning" on the landing page
  function enter() {
    setPage("scan");
    setEntered(true);
    saveEntered(true);
    window.scrollTo(0, 0);
  }

  // Clicking the logo goes back to the landing page
  function leave() {
    setEntered(false);
    saveEntered(false);
    window.scrollTo(0, 0);
  }

  return (
    // reducedMotion="user": respects the "reduce motion" setting on the user's device
    <MotionConfig reducedMotion="user">
      <AnimatePresence mode="wait">
        {!entered ? (
          <Landing key="landing" onStart={enter} />
        ) : (
          <motion.div
            key="app"
            className="app"
            // slides in from the right, following the ship's direction of travel
            initial={{ x: "100%" }}
            animate={{ x: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } }}
            exit={{ opacity: 0, transition: { duration: 0.4, ease: EASE } }}
          >
            {/* ---------- Sidebar ---------- */}
            <aside className={`sidebar ${collapsed ? "collapsed" : ""}`}>
              <button className="brand" onClick={leave} title="Back to the landing page">
                <img src={pennyMark} alt="" className="brand-logo" />
                <span className="brand-text">
                  <span className="brand-name">Penny</span>
                  <span className="brand-sub">{t("brandSub")}</span>
                </span>
              </button>
              {/* the round button on the sidebar's edge: collapse to icons / expand again */}
              <button
                className="sidebar-toggle"
                onClick={toggleSidebar}
                aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                  <path d="M7.5 2.5 4 6l3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <nav className="nav">
                {PAGES.map((p) => (
                  <button
                    key={p.id}
                    className={`nav-link ${page === p.id ? "active" : ""}`}
                    onClick={() => setPage(p.id)}
                    title={collapsed ? t(p.label) : undefined}
                  >
                    {/* the highlight slides between buttons (layoutId makes it one moving element) */}
                    {page === p.id && (
                      <motion.span
                        layoutId="nav-active"
                        className="nav-active"
                        transition={{ type: "spring", stiffness: 420, damping: 36 }}
                      />
                    )}
                    <p.Icon className="nav-icon" />
                    <span className="nav-label">{t(p.label)}</span>
                  </button>
                ))}
              </nav>
              <div className="sidebar-foot">
                {/* switch the whole app between the language of Odysseus's age and plain modern English */}
                <div className="lang-switch" role="group" aria-label="Language">
                  <button className={ancient ? "is-on" : ""} onClick={() => setAncient(true)} aria-pressed={ancient}>
                    {t("langOld")}
                  </button>
                  <button className={!ancient ? "is-on" : ""} onClick={() => setAncient(false)} aria-pressed={!ancient}>
                    {t("langNew")}
                  </button>
                </div>
                <p className="sidebar-quote">Every penny finds its way home.</p>
              </div>
            </aside>

            {/* ---------- Main area: shows the chosen page ---------- */}
            <main className="main">
              <AnimatePresence mode="wait">
                <motion.div
                  key={page}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.35, ease: EASE }}
                >
                  {/* the chat page has its own slim header, like a normal chat app */}
                  {page !== "athena" && (
                    <header className="page-head">
                      <span className="eyebrow">{t(current.eyebrow)}</span>
                      <h1>{t(current.title)}</h1>
                      <AxesLine className="page-axes" delay={0.2} duration={1.1} />
                    </header>
                  )}

                  {page === "dashboard" && <Dashboard />}
                  {page === "scan" && <ScanPage onViewDashboard={() => setPage("dashboard")} />}
                  {page === "athena" && <AthenaPage chat={athenaChat} />}
                </motion.div>
              </AnimatePresence>
            </main>
          </motion.div>
        )}
      </AnimatePresence>
    </MotionConfig>
  );
}
