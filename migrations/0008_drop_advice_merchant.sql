-- 0008_drop_advice_merchant
-- Advice is out of scope: its catalogue and prices render only in the browser
-- and its sitemap is stale, so no scraper exists. The row seeded in 0001 is
-- removed so the merchant list matches the stores actually tracked. It never
-- had listings or scrape runs; the guards make that explicit, and the delete
-- fails on the foreign keys rather than cascade if that ever changes.

DELETE FROM merchants
WHERE slug = 'advice'
  AND NOT EXISTS (
      SELECT 1 FROM merchant_listings l
      JOIN merchants m ON m.id = l.merchant_id
      WHERE m.slug = 'advice'
  )
  AND NOT EXISTS (
      SELECT 1 FROM scrape_runs r
      JOIN merchants m ON m.id = r.merchant_id
      WHERE m.slug = 'advice'
  );
