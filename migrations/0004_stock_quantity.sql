-- 0004_stock_quantity
-- Some merchants (e.g. IHAVECPU) publish the exact units on hand. Inventory
-- velocity, delta(stock_quantity) / delta(scraped_at), is a direct demand
-- signal where no sold counter is shown. NULL where the merchant hides it.

ALTER TABLE merchant_listings ADD COLUMN stock_quantity INTEGER CHECK (stock_quantity >= 0);
ALTER TABLE price_history     ADD COLUMN stock_quantity INTEGER CHECK (stock_quantity >= 0);
