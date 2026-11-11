import { readFile } from "node:fs/promises";
import pg from "pg";

const { Client } = pg;
const mode = process.argv[2] ?? "seed";
if (!new Set(["seed", "clear"]).has(mode)) {
  throw new Error("Use 'seed' or 'clear'.");
}

const database = new Client({
  host: process.env.PGHOST ?? "127.0.0.1",
  port: Number(process.env.PGPORT ?? 5432),
  database: process.env.PGDATABASE ?? "onramp",
  user: process.env.PGUSER ?? "postgres",
  password: process.env.PGPASSWORD,
  ssl: process.env.PGSSL === "true" ? true : false,
});

await database.connect();
try {
  const sqlPath = mode === "seed"
    ? "../database/postgresql/032-demo-content.sql"
    : "../database/postgresql/033-clear-demo-content.sql";
  const sql = await readFile(new URL(sqlPath, import.meta.url), "utf8");
  await database.query(sql);
  console.log(mode === "seed" ? "Local walkthrough data is ready." : "Local walkthrough data was removed.");
} catch (error) {
  await database.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  await database.end();
}
