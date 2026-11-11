import "server-only";
import postgres from "postgres";

/**
 * Server-only PostgreSQL client. DATABASE_URL never reaches the browser: this
 * module imports "server-only", so bundling it into a client component fails
 * the build.
 *
 * On serverless hosts each function instance keeps at most one connection.
 * Use Supabase's session pooler (port 5432): through the transaction pooler
 * (6543) the build's concurrent prerendering hung and returned rows of the
 * wrong query. Prepared statements stay disabled so either pooler is safe
 * for plain queries.
 */
const globalForDb = globalThis as unknown as { sql?: ReturnType<typeof postgres> };

function createClient(): ReturnType<typeof postgres> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  return postgres(url, { max: 1, idle_timeout: 20, prepare: false });
}

export const sql = globalForDb.sql ?? createClient();
if (process.env.NODE_ENV !== "production") {
  globalForDb.sql = sql;
}
