import { execFileSync } from "node:child_process";
import pg from "pg";

const cloudMode = process.argv.includes("--cloud");
const localMode = process.argv.includes("--local");
const environmentFile = cloudMode ? ".env.cloud" : ".env.local";
const host = process.env.PGHOST ?? "127.0.0.1";
const databaseName = process.env.PGDATABASE ?? "onramp";

if (cloudMode === localMode) {
  throw new Error("Choose exactly one reset target: --local or --cloud.");
}

if (localMode && !new Set(["localhost", "127.0.0.1", "::1"]).has(host)) {
  throw new Error("Local reset refused: PGHOST must point to this computer.");
}

if (cloudMode && (!host.endsWith(".postgres.database.azure.com") || databaseName !== "onramp")) {
  throw new Error("Cloud reset refused: PGHOST must be an Azure PostgreSQL Flexible Server and PGDATABASE must be onramp.");
}

const database = new pg.Client({
  host,
  port: Number(process.env.PGPORT ?? 5432),
  database: databaseName,
  user: process.env.PGUSER ?? "postgres",
  password: process.env.PGPASSWORD,
  ssl: process.env.PGSSL === "true" ? true : false,
});

await database.connect();
try {
  const tables = await database.query(`
    SELECT string_agg(format('%I.%I', namespace.nspname, relation.relname), ', ') AS table_list
    FROM pg_class AS relation
    INNER JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relkind IN ('r', 'p')
      AND relation.relispartition IS FALSE
  `);
  if (!tables.rows[0]?.table_list) throw new Error("No application tables were found in the public schema.");
  await database.query(`TRUNCATE TABLE ${tables.rows[0].table_list} RESTART IDENTITY CASCADE`);
console.log(`${cloudMode ? "Azure" : "Local"} database rows cleared; PostgreSQL schema preserved.`);
} finally {
  await database.end();
}

execFileSync(process.execPath, [`--env-file=${environmentFile}`, "scripts/setup-local-db.js"], { stdio: "inherit" });
execFileSync(process.execPath, [`--env-file=${environmentFile}`, "scripts/manage-demo-content.js", "seed"], { stdio: "inherit" });
console.log(`${cloudMode ? "Azure" : "Local"} demo data rebuilt with the 20-person walkthrough scenario.`);
