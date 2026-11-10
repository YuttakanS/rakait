-- 0006_insights
-- Outputs of the ML pipeline (pricewatch train), recomputed after each run and
-- read by the web app. Kept separate from scraped facts so a model change
-- never touches the raw ledger.

CREATE TABLE listing_insights (
    listing_id      BIGINT PRIMARY KEY REFERENCES merchant_listings (id) ON DELETE CASCADE,
    computed_at     TIMESTAMPTZ NOT NULL,
    model_version   TEXT NOT NULL,
    fair_price      NUMERIC(12, 2),
    residual        NUMERIC(12, 2),             -- price - fair_price (THB)
    pct_vs_fair     DOUBLE PRECISION,           -- residual / fair_price
    deal_score      SMALLINT CHECK (deal_score BETWEEN 0 AND 100),
    demand_cluster  TEXT,                       -- K-Means segment label
    recommendation  TEXT CHECK (recommendation IN ('buy_now', 'wait', 'fair_price')),
    recommendation_reason TEXT,
    sales_per_day   DOUBLE PRECISION,
    views_per_day   DOUBLE PRECISION
);

-- Discovery filters on the web app ("Hidden Gems", best deals first).
CREATE INDEX listing_insights_cluster_idx ON listing_insights (demand_cluster, deal_score DESC);

-- Market-level results: regression coefficients, tree rules, cluster
-- centroids and evaluation metrics, one JSON document per (category, kind).
CREATE TABLE market_insights (
    category     TEXT NOT NULL CHECK (category IN ('gpu', 'cpu', 'ram', 'ssd', 'all')),
    kind         TEXT NOT NULL,
    computed_at  TIMESTAMPTZ NOT NULL,
    payload      JSONB NOT NULL,
    PRIMARY KEY (category, kind)
);

ALTER TABLE listing_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_insights  ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    api_role TEXT;
BEGIN
    FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
            EXECUTE format('REVOKE ALL ON listing_insights, market_insights FROM %I', api_role);
        END IF;
    END LOOP;
END
$$;
