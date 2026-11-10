-- 0005_listing_specs
-- Listing-level attributes parsed from merchant titles by pricewatch.normalize.
-- `brand` is the product brand (board partner for GPUs); `specs` holds the
-- parsed attributes of that specific SKU. Model-level specs, reconciled across
-- merchants, live in canonical_products.specs.

ALTER TABLE merchant_listings ADD COLUMN brand TEXT;
ALTER TABLE merchant_listings ADD COLUMN specs JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE merchant_listings ADD COLUMN linked_at TIMESTAMPTZ;
