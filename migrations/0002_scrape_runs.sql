-- 0002_scrape_runs
-- Operational log: one row per (store, category) attempt in every scrape, so a
-- broken selector or blocked request is visible as an error or a sudden drop
-- in listing_count instead of a silent gap in price_history.

CREATE TABLE scrape_runs (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    merchant_id    SMALLINT NOT NULL REFERENCES merchants (id),
    -- NULL when the store failed before any category was attempted.
    category       TEXT CHECK (category IN ('gpu', 'cpu', 'ram', 'ssd')),
    started_at     TIMESTAMPTZ NOT NULL,
    finished_at    TIMESTAMPTZ NOT NULL,
    listing_count  INTEGER NOT NULL CHECK (listing_count >= 0),
    error          TEXT,
    CHECK (finished_at >= started_at)
);

-- "Latest runs for a store" and "compare today's count with yesterday's".
CREATE INDEX scrape_runs_merchant_started_idx
    ON scrape_runs (merchant_id, category, started_at DESC);

-- Failure dashboard / alerting: only failed runs are indexed.
CREATE INDEX scrape_runs_failed_idx
    ON scrape_runs (started_at DESC)
    WHERE error IS NOT NULL;
