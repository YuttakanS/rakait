-- 0009_link_method
-- How each listing was linked to its canonical product: by the rule-based
-- extractor, or by TF-IDF similarity fallback (with its cosine score), so
-- the web app and the report can tell the two apart and audit the fallback.

ALTER TABLE merchant_listings
    ADD COLUMN link_method TEXT CHECK (link_method IN ('rule', 'similarity')),
    ADD COLUMN link_score  REAL CHECK (link_score BETWEEN -1 AND 1);
