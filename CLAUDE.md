I'm building a solo hackathon project called "Penny" (HackUTA 2026, ~24 hours left).

IDEA: A personal spending-insights dashboard. Users upload receipt photos (or a
bank CSV). Gemini extracts merchant/date/amount/category. Data is stored as
time-series in TimescaleDB and shown in a dashboard: spending over time, category
breakdown, calendar heatmap, top merchants, AI-written insights, and an
"ask your data" chat (natural language -> SQL). Stretch features: budgets,
forecast, recurring-charge detection, unusual-spending alerts. Features aren't
final yet; we'll decide as we go. Seeded fake data (~6 months) for the demo.

STACK:
- Backend: Node + TypeScript (Express), run with tsx; packages: express, pg,
  @google/genai, dotenv, cors, multer
- Frontend: React + TypeScript (Vite) + Recharts. I have some React experience;
  keep it simple and explain things.
- Database: Tiger Cloud (hosted TimescaleDB, Postgres). One DB only. Raw
  receipt JSON goes in a JSONB column; transactions go in a hypertable.
- AI: Gemini API (gemini-3.6-flash)
- Deploy later on Vultr. Sponsor prize tracks: Tiger Data, Gemini, Vultr.
- I'm on a Mac, using VS Code.

DONE SO FAR:
- penny/ folder with server/ and client/ (client/ still empty)
- On GitHub (private repo "penny"). I make commits/pushes myself from my own
  terminal; just give me the commands.
- .gitignore in penny/ (ignores .env, node_modules, dist, .DS_Store)
- server/.env with DATABASE_URL, GEMINI_API_KEY, GEMINI_MODEL, APP_TIMEZONE, PORT (4000)
- Server setup done: package.json ("type": "module", Express 5, TypeScript 7),
  tsconfig.json (module nodenext → local imports need ".js" endings).
  Scripts: npm run dev (tsx watch), build, start, typecheck.
- server/src/index.ts: minimal Express app with GET /api/health → {"ok":true} (tested)

NEXT STEP: connect the server to Tiger Cloud (pg Pool), then design the
database tables. Take it slowly, one decision at a time.

RULES FOR WORKING WITH ME:
- Go step by step, one thing at a time. Keep messages short; long, dense
  explanations overwhelm me.
- Explain what you're about to do and ASK BEFORE writing any code or running commands.
- Never read, print, or edit server/.env — it contains my secrets.