-- 0007_scrape_run_warnings
-- Data-quality warnings for runs that succeeded but look wrong (zero listings,
-- mostly missing prices, a sudden drop against recent runs): the signature of
-- a merchant redesign that breaks selectors without raising an error.
-- Kept apart from `error` so failure dashboards and the partial index on
-- failed runs keep their meaning.

ALTER TABLE scrape_runs ADD COLUMN warning TEXT;

-- Only a handful of runs ever warn; index just those, like failed runs.
CREATE INDEX scrape_runs_warned_idx
    ON scrape_runs (started_at DESC)
    WHERE warning IS NOT NULL;
