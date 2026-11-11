-- 0010_listing_image
-- Merchant product thumbnail URL for the web app's product cards. Stored as
-- the merchant serves it (hot-linked, never downloaded); NULL when the card
-- has none. Archive backfills carry no image and never clear a known one.

ALTER TABLE merchant_listings ADD COLUMN image_url TEXT;
