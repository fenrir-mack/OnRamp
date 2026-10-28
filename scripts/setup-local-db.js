import { readFile } from "node:fs/promises";
import pg from "pg";

const { Client } = pg;
const databaseName = process.env.PGDATABASE ?? "onramp";
const connectionOptions = {
  host: process.env.PGHOST ?? "127.0.0.1",
  port: Number(process.env.PGPORT ?? 5432),
  user: process.env.PGUSER ?? "postgres",
  password: process.env.PGPASSWORD,
  ssl: false,
};

const admin = new Client({ ...connectionOptions, database: "postgres" });
await admin.connect();

try {
  const existingDatabase = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [databaseName]);
  if (existingDatabase.rowCount === 0) {
    await admin.query(`CREATE DATABASE "${databaseName.replaceAll('"', '""')}"`);
    console.log(`Created local database: ${databaseName}`);
  } else {
    console.log(`Database already exists: ${databaseName}`);
  }
} finally {
  await admin.end();
}

const database = new Client({ ...connectionOptions, database: databaseName });
await database.connect();

try {
  const existingSchema = await database.query("SELECT to_regclass('public.departments') AS table_name");
  const schema = existingSchema.rows[0].table_name
    ? ""
    : await readFile(new URL("../database/postgresql/001-schema.sql", import.meta.url), "utf8");
  const authMigration = await readFile(new URL("../database/postgresql/004-auth.sql", import.meta.url), "utf8");
  const hrPlansMigration = await readFile(new URL("../database/postgresql/005-employee-plans.sql", import.meta.url), "utf8");
  const hrAccessMigration = await readFile(new URL("../database/postgresql/006-hr-access.sql", import.meta.url), "utf8");
  const planResourcesMigration = await readFile(new URL("../database/postgresql/007-employee-plan-resources.sql", import.meta.url), "utf8");
  const planConfigurationsMigration = await readFile(new URL("../database/postgresql/008-employee-plan-configurations.sql", import.meta.url), "utf8");
  const resourceFilesMigration = await readFile(new URL("../database/postgresql/009-resource-files.sql", import.meta.url), "utf8");
  const removeResourceEstimatedMinutesMigration = await readFile(new URL("../database/postgresql/010-remove-resource-estimated-minutes.sql", import.meta.url), "utf8");
  const hrTaskPresetsMigration = await readFile(new URL("../database/postgresql/011-hr-task-presets.sql", import.meta.url), "utf8");
  const taskResponsiblePeopleMigration = await readFile(new URL("../database/postgresql/012-task-responsible-people.sql", import.meta.url), "utf8");
  const preEntryTaskPresets = await readFile(new URL("../database/postgresql/013-seed-pre-entry-presets.sql", import.meta.url), "utf8");
  const employeeOrganizationMigration = await readFile(new URL("../database/postgresql/014-employee-organization.sql", import.meta.url), "utf8");
  const teamHierarchyMigration = await readFile(new URL("../database/postgresql/015-team-hierarchies.sql", import.meta.url), "utf8");
  const employeePlanProgressMigration = await readFile(new URL("../database/postgresql/016-employee-plan-progress.sql", import.meta.url), "utf8");
  const seed = await readFile(new URL("../database/postgresql/002-seed.sql", import.meta.url), "utf8");
  const resources = await readFile(new URL("../database/postgresql/003-local-resources.sql", import.meta.url), "utf8");
  await database.query(`BEGIN;\n${schema}\n${authMigration}\n${hrPlansMigration}\n${hrAccessMigration}\n${planResourcesMigration}\n${planConfigurationsMigration}\n${resourceFilesMigration}\n${removeResourceEstimatedMinutesMigration}\n${hrTaskPresetsMigration}\n${taskResponsiblePeopleMigration}\n${seed}\n${resources}\n${preEntryTaskPresets}\n${employeeOrganizationMigration}\n${teamHierarchyMigration}\n${employeePlanProgressMigration}\nCOMMIT;`);
  console.log(existingSchema.rows[0].table_name
    ? "OnRamp schema exists; demo data is up to date."
    : "OnRamp schema and demo data are ready.");
} finally {
  await database.end();
}
