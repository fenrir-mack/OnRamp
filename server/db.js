import { DefaultAzureCredential } from "@azure/identity";
import pg from "pg";

const { Pool } = pg;
const postgresHost = process.env.PGHOST;
const postgresDatabase = process.env.PGDATABASE;
const postgresUser = process.env.PGUSER;
const postgresPort = Number(process.env.PGPORT ?? 5432);
const accessTokenScope = "https://ossrdbms-aad.database.windows.net/.default";

const poolOptions = {
  host: postgresHost,
  port: postgresPort,
  database: postgresDatabase,
  user: postgresUser,
  ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: true },
  max: Number(process.env.PGPOOL_MAX ?? 5),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
};

if (process.env.PGPASSWORD) {
  // Local development can pass a password through the environment.
  poolOptions.password = process.env.PGPASSWORD;
} else {
  // App Service uses its system-assigned managed identity. The token callback
  // runs for each new connection, so the pool does not retain expired tokens.
  const credential = new DefaultAzureCredential();
  poolOptions.password = async () => {
    const token = await credential.getToken(accessTokenScope);
    if (!token) throw new Error("Could not obtain a PostgreSQL access token.");
    return token.token;
  };
}

export const pool = new Pool(poolOptions);

pool.on("error", (error) => {
  console.error("Unexpected idle PostgreSQL client error:", error.message);
});
