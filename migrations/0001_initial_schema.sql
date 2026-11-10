-- 0001_initial_schema
-- Core relational model: merchants, canonical products, merchant listings and
-- the append-only price ledger.

CREATE TABLE merchants (
    id          SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    slug        TEXT NOT NULL UNIQUE,
    name        TEXT NOT NULL,
    base_url    TEXT NOT NULL
);

INSERT INTO merchants (slug, name, base_url) VALUES
    ('ihavecpu', 'IHAVECPU', 'https://www.ihavecpu.com'),
    ('jib',      'JIB',      'https://www.jib.co.th'),
    ('banana',   'BaNANA',   'https://www.bnn.in.th'),
    ('advice',   'Advice',   'https://www.advice.co.th'),
    ('itcity',   'IT City',  'https://www.itcity.in.th');

-- One row per silicon model (e.g. "GeForce RTX 5060 Ti 16GB"), independent of
-- board partner and merchant. Category-specific attributes live in `specs`
-- because a GPU and a CPU share almost no columns.
CREATE TABLE canonical_products (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    category      TEXT NOT NULL CHECK (category IN ('gpu', 'cpu', 'ram', 'ssd')),
    manufacturer  TEXT NOT NULL,
    model         TEXT NOT NULL,
    specs         JSONB NOT NULL DEFAULT '{}'::jsonb,
    release_date  DATE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (category, manufacturer, model)
);

-- One row per product page at a merchant. Holds the latest observed state so
-- "current price" queries never touch the history table.
CREATE TABLE merchant_listings (
    id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    merchant_id           SMALLINT NOT NULL REFERENCES merchants (id),
    merchant_sku          TEXT NOT NULL,
    canonical_product_id  BIGINT REFERENCES canonical_products (id) ON DELETE SET NULL,
    category              TEXT NOT NULL CHECK (category IN ('gpu', 'cpu', 'ram', 'ssd')),
    title                 TEXT NOT NULL,
    url                   TEXT NOT NULL,
    spec_text             TEXT,
    current_price         NUMERIC(12, 2) CHECK (current_price >= 0),
    view_count            BIGINT CHECK (view_count >= 0),
    sold_count            BIGINT CHECK (sold_count >= 0),
    in_stock              BOOLEAN NOT NULL,
    first_seen_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_scraped_at       TIMESTAMPTZ NOT NULL,
    UNIQUE (merchant_id, merchant_sku)
);

-- Price comparison path: all merchants' listings for one canonical product.
CREATE INDEX merchant_listings_canonical_idx
    ON merchant_listings (canonical_product_id, merchant_id)
    WHERE canonical_product_id IS NOT NULL;

-- Record-linkage work queue: listings not yet matched to a canonical product.
CREATE INDEX merchant_listings_unlinked_idx
    ON merchant_listings (category)
    WHERE canonical_product_id IS NULL;

-- Append-only time series, one row per listing per scrape. view_count and
-- sold_count are cumulative counters as shown by the merchant; sales velocity
-- is derived as delta(sold_count) / delta(scraped_at) between observations.
-- The primary key doubles as the time-series index: a listing's history is a
-- single contiguous B-tree range scan.
CREATE TABLE price_history (
    listing_id  BIGINT NOT NULL REFERENCES merchant_listings (id) ON DELETE CASCADE,
    scraped_at  TIMESTAMPTZ NOT NULL,
    price       NUMERIC(12, 2) CHECK (price >= 0),
    view_count  BIGINT CHECK (view_count >= 0),
    sold_count  BIGINT CHECK (sold_count >= 0),
    in_stock    BOOLEAN NOT NULL,
    PRIMARY KEY (listing_id, scraped_at)
);

-- Market-wide scans over a time window (e.g. training-set extraction).
CREATE INDEX price_history_scraped_at_idx ON price_history USING brin (scraped_at);
