import { useState } from "react";
import Dashboard from "./Dashboard";
import ScanPage from "./ScanPage";
import logoMark from "./assets/logo-mark.png";
import templeIcon from "./assets/building.png";
import shipIcon from "./assets/voyage.png";
import owlIcon from "./assets/owl.png";

// The pages in the sidebar
type Page = "dashboard" | "scan" | "athena";
const PAGES: { id: Page; label: string; icon: string }[] = [
  { id: "dashboard", label: "Dashboard", icon: templeIcon },
  { id: "scan", label: "Scan Receipt", icon: shipIcon },
  { id: "athena", label: "Ask Athena", icon: owlIcon },
];

export default function App() {
  // which page is showing right now
  const [page, setPage] = useState<Page>("dashboard");

  return (
    <div className="app">
      {/* ---------- Sidebar ---------- */}
      <aside className="sidebar">
        <div className="brand">
          <img src={logoMark} alt="" className="brand-logo" />
          <span>Penny</span>
        </div>
        <nav className="nav">
          {PAGES.map((p) => (
            <button
              key={p.id}
              className={`nav-link ${page === p.id ? "active" : ""}`}
              onClick={() => setPage(p.id)}
            >
              <img src={p.icon} alt="" className="nav-icon" />
              {p.label}
            </button>
          ))}
        </nav>
      </aside>

      {/* ---------- Main area: shows the chosen page ---------- */}
      <main className="main">
        {page === "dashboard" && <Dashboard />}
        {page === "scan" && <ScanPage onViewDashboard={() => setPage("dashboard")} />}
        {page === "athena" && (
          <div className="card">
            <h2>Ask Athena</h2>
            <p className="muted">Coming soon</p>
          </div>
        )}
      </main>
    </div>
  );
}
