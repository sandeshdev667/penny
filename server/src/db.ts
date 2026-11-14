import pg from "pg";

// A pool of reusable database connections.
// It reads DATABASE_URL from .env (loaded by dotenv in index.ts).
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});
