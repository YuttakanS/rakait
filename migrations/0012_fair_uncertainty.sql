-- 0012_fair_uncertainty
-- How far to trust each fair price (pricewatch train, model 2026.11-v4).
--
--   fair_error_pct  Half-width of the 80% prediction interval of the fair
--                   price, as a fraction: the "± Y%" shown beside it.
--   fair_uncertain  The listing price is more than 40% away from the fair
--                   price. Such a gap is far outside the fit's typical
--                   error, so the row keeps its fair price for reference
--                   but carries no Deal Score and is never ranked as a deal.
--
-- Additive with a default: train rewrites the table each run, and the
-- existing SELECT grant to web_reader (0011) covers new columns.

ALTER TABLE listing_insights
    ADD COLUMN fair_error_pct DOUBLE PRECISION CHECK (fair_error_pct >= 0),
    ADD COLUMN fair_uncertain BOOLEAN NOT NULL DEFAULT false;
