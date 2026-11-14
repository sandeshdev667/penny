import "dotenv/config";
import { readFile } from "node:fs/promises";
import { pool } from "./db.js";

// Read schema.sql and send it to the database
const sql = await readFile(new URL("../sql/schema.sql", import.meta.url), "utf8");
await pool.query(sql);
console.log("✅ Database tables are ready");

await pool.end(); // close the connection so the script exits
