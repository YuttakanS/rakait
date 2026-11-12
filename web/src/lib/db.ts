import "server-only";
import postgres from "postgres";

/**
 * Server-only PostgreSQL client. DATABASE_URL never reaches the browser: this
 * module imports "server-only", so bundling it into a client component fails
 * the build.
 *
 * Which Supabase pooler each phase uses:
 * - Build (`next build`, NEXT_PHASE = "phase-production-build"): the session
 *   pooler (port 5432), as given in DATABASE_URL. Through the transaction
 *   pooler (6543) the build's concurrent prerendering hung and returned rows of
 *   the wrong query.
 * - Runtime (serving requests): the transaction pooler (6543). The session
 *   pooler caps every client of the project at pool_size (15) and a client
 *   keeps its slot for the whole session, so idle serverless instances, a
 *   build overlapping the previous deployment, and a burst of product-page
 *   prefetches filled it (EMAXCONNSESSION, HTTP 500). The transaction pooler
 *   hands the server connection back after every transaction.
 *   The runtime URL is DATABASE_RUNTIME_URL when set; otherwise DATABASE_URL
 *   with the port switched to 6543 when it points at a Supabase session pooler
 *   (`*.pooler.supabase.com:5432`); otherwise DATABASE_URL unchanged (local or
 *   dev database).
 *
 * Each instance keeps at most one connection and closes it after 5 s idle.
 * Prepared statements stay disabled: the transaction pooler cannot keep them
 * across transactions. Pipelining is off (`max_pipeline: 0`): when postgres.js
 * sent a second query on the connection before the first returned (e.g. a
 * page's `Promise.all`), the transaction pooler never answered and every later
 * query on that connection hung. Concurrent queries of one instance therefore
 * run one after another, one extra same-region round trip each.
 * Type fetching is off (`fetch_types: false`): by default postgres.js queries
 * pg_type on every new connection to learn the OIDs of array types so it can
 * parse arrays of custom types. No query here sends or returns an array
 * (queries.ts only indexes `array_agg(...)[1]` down to a scalar) and the
 * schema has no custom types or enums (migrations/), so that round trip on
 * each cold connection bought nothing.
 * Never log the URL: it carries the password.
 */
const BUILD_PHASE = "phase-production-build";
const SESSION_POOLER_PORT = "5432";
const TRANSACTION_POOLER_PORT = "6543";
const SUPABASE_POOLER_HOST_SUFFIX = ".pooler.supabase.com";

/**
 * Picks the connection string for the current Next.js phase. O(len(url)).
 *
 * @param env Process environment (DATABASE_URL, DATABASE_RUNTIME_URL, NEXT_PHASE).
 * @returns The URL to connect with.
 * @throws Error when DATABASE_URL is not set.
 */
export function resolveDatabaseUrl(env: NodeJS.ProcessEnv): string {
  const url = env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  if (env.NEXT_PHASE === BUILD_PHASE) {
    return url;
  }
  if (env.DATABASE_RUNTIME_URL) {
    return env.DATABASE_RUNTIME_URL;
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url; // Not a URL we can rewrite; let postgres() report it.
  }
  const isSupabaseSessionPooler =
    parsed.hostname.endsWith(SUPABASE_POOLER_HOST_SUFFIX) && parsed.port === SESSION_POOLER_PORT;
  if (!isSupabaseSessionPooler) {
    return url;
  }
  parsed.port = TRANSACTION_POOLER_PORT;
  return parsed.toString();
}

const globalForDb = globalThis as unknown as { sql?: ReturnType<typeof postgres> };

function createClient(): ReturnType<typeof postgres> {
  // postgres.js reads `max_pipeline` but its typings omit it, hence the
  // intersection type instead of an inline literal.
  const options: postgres.Options<Record<string, postgres.PostgresType>> & { max_pipeline: number } = {
    max: 1,
    idle_timeout: 5,
    connect_timeout: 10,
    prepare: false,
    max_pipeline: 0,
    fetch_types: false,
  };
  return postgres(resolveDatabaseUrl(process.env), options);
}

export const sql = globalForDb.sql ?? createClient();
if (process.env.NODE_ENV !== "production") {
  globalForDb.sql = sql;
}
