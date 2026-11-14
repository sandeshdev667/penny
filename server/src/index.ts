import "dotenv/config"; // loads .env into process.env (first, before anything else)
import express from "express";
import cors from "cors";

const app = express();
const port = Number(process.env.PORT) || 3001;

app.use(cors()); // allow the React app to call this API
app.use(express.json()); // parse JSON request bodies

// Health check: a simple route to confirm the server is alive
app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.listen(port, () => {
  console.log(`Penny server running on http://localhost:${port}`);
});
