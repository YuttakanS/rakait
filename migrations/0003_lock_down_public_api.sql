-- 0003_lock_down_public_api
-- On Supabase, tables in the `public` schema are reachable through the Data
-- API whenever the `anon` / `authenticated` roles hold privileges on them, and
-- the anon (publishable) key ships to browsers. This platform's backend writes
-- as the table owner and the web app reads through our own API, so no client
-- role needs direct table access:
--   * RLS is enabled with no policies, which denies every row to any
--     non-owner role (owners are not subject to RLS unless FORCE is set).
--   * Privileges are revoked explicitly so the tables are not exposed even if
--     a project-level default grant re-adds them.
-- On plain PostgreSQL (CI, local) the Supabase roles do not exist and the
-- REVOKE step is skipped.

ALTER TABLE merchants          ENABLE ROW LEVEL SECURITY;
ALTER TABLE canonical_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_listings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_history      ENABLE ROW LEVEL SECURITY;
ALTER TABLE scrape_runs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE schema_migrations  ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    api_role TEXT;
BEGIN
    FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
            EXECUTE format(
                'REVOKE ALL ON merchants, canonical_products, merchant_listings, '
                'price_history, scrape_runs, schema_migrations FROM %I',
                api_role
            );
        END IF;
    END LOOP;
END
$$;
