import { useState } from "react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import Landing from "./Landing";
import Dashboard from "./Dashboard";
import ScanPage from "./ScanPage";
import Meander from "./Meander";
import { EASE } from "./anim";
import logoMark from "./assets/logo-mark.png";
import templeIcon from "./assets/building.png";
import shipIcon from "./assets/voyage.png";
import owlIcon from "./assets/owl.png";

// The pages in the sidebar (eyebrow = the small line above each page title)
type Page = "dashboard" | "scan" | "athena";
const PAGES: { id: Page; label: string; icon: string; eyebrow: string; title: string }[] = [
  { id: "dashboard", label: "Dashboard", icon: templeIcon, eyebrow: "The ledger", title: "Where the money sailed" },
  { id: "scan", label: "Scan Receipt", icon: shipIcon, eyebrow: "Bring it home", title: "Scan a receipt" },
  { id: "athena", label: "Ask Athena", icon: owlIcon, eyebrow: "Counsel", title: "Ask Athena" },
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

export default function App() {
  const [entered, setEntered] = useState(loadEntered); // false = show the landing page
  const [page, setPage] = useState<Page>("dashboard"); // which page is showing right now
  const current = PAGES.find((p) => p.id === page)!;

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
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: EASE }}
          >
            {/* ---------- Sidebar ---------- */}
            <aside className="sidebar">
              <button className="brand" onClick={leave} title="Back to the landing page">
                <img src={logoMark} alt="" className="brand-logo" />
                <span>Penny</span>
              </button>
              <nav className="nav">
                {PAGES.map((p) => (
                  <button
                    key={p.id}
                    className={`nav-link ${page === p.id ? "active" : ""}`}
                    onClick={() => setPage(p.id)}
                  >
                    {/* the highlight slides between buttons (layoutId makes it one moving element) */}
                    {page === p.id && (
                      <motion.span
                        layoutId="nav-active"
                        className="nav-active"
                        transition={{ type: "spring", stiffness: 420, damping: 36 }}
                      />
                    )}
                    <img src={p.icon} alt="" className="nav-icon" />
                    <span className="nav-label">{p.label}</span>
                  </button>
                ))}
              </nav>
              <div className="sidebar-foot">
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
                  <header className="page-head">
                    <span className="eyebrow">{current.eyebrow}</span>
                    <h1>{current.title}</h1>
                    <Meander units={11} className="page-meander" delay={0.15} duration={1.1} />
                  </header>

                  {page === "dashboard" && <Dashboard />}
                  {page === "scan" && <ScanPage onViewDashboard={() => setPage("dashboard")} />}
                  {page === "athena" && (
                    <div className="card athena-soon">
                      <motion.img
                        src={owlIcon}
                        alt=""
                        className="athena-owl"
                        animate={{ y: [0, -8, 0] }}
                        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                      />
                      <div>
                        <h2>Athena is still on her way</h2>
                        <p className="muted">
                          Soon you'll ask questions about your spending in plain English, and she'll answer from
                          your own data.
                        </p>
                        <span className="tag">Coming soon</span>
                      </div>
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </main>
          </motion.div>
        )}
      </AnimatePresence>
    </MotionConfig>
  );
}
