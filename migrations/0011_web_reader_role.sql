-- 0011_web_reader_role
-- A least-privilege role for the deployed web app. The app only reads, so a
-- leaked connection string (it lives in the hosting provider's env vars) or a
-- query bug must not be able to write, drop or read beyond what pages show.
--
--   * SELECT only, on the tables the pages query (not schema_migrations).
--   * RLS stays enabled (0003, 0006); this role gets read-only policies. The
--     Supabase API roles (anon, authenticated) still get nothing.
--   * NOLOGIN here: a migration must never create a passwordless login. The
--     operator enables login with a password once, out of band:
--         ALTER ROLE web_reader WITH LOGIN PASSWORD '<secret>';
--   * A statement timeout caps any runaway page query.
--
-- Roles are cluster-wide, so creation is guarded for databases where the
-- role already exists (several test databases on one CI server).

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'web_reader') THEN
        CREATE ROLE web_reader NOLOGIN NOINHERIT;
    END IF;
END
$$;

ALTER ROLE web_reader SET statement_timeout = '15s';

-- The schema the migrations run in (public in production, a throwaway one in tests).
DO $$
BEGIN
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO web_reader', current_schema());
END
$$;
GRANT SELECT ON merchants, canonical_products, merchant_listings, price_history,
                scrape_runs, listing_insights, market_insights
    TO web_reader;

CREATE POLICY web_reader_select ON merchants          FOR SELECT TO web_reader USING (true);
CREATE POLICY web_reader_select ON canonical_products FOR SELECT TO web_reader USING (true);
CREATE POLICY web_reader_select ON merchant_listings  FOR SELECT TO web_reader USING (true);
CREATE POLICY web_reader_select ON price_history      FOR SELECT TO web_reader USING (true);
CREATE POLICY web_reader_select ON scrape_runs        FOR SELECT TO web_reader USING (true);
CREATE POLICY web_reader_select ON listing_insights   FOR SELECT TO web_reader USING (true);
CREATE POLICY web_reader_select ON market_insights    FOR SELECT TO web_reader USING (true);
