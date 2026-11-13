-- 0013_model_demand_evidence
-- The numbers behind a model's demand group (pricewatch train, model
-- 2026.11-v14; SPEC round 16). A group chip such as "คนดูเยอะ แต่ขายน้อย"
-- showed no figure a shopper could check it against. These are the values
-- the K-Means clustering itself reads (ml/train.py model_demand), stored so
-- the web never re-derives them with a formula that could drift:
--
--   model_views             Views of the model summed over the stores that
--                           publish them.
--   model_sales_beats_pct   Share [0, 1) of the same store's listings that
--                           sold strictly less, averaged per store, then
--                           across stores ("ขายดีกว่า N% ของสินค้าในร้าน").
--   model_normalized_price  Lowest in-stock price over the median price of
--                           the model's listings (the third clustered
--                           feature).
--   demand_driver           The clustered feature that most keeps the model
--                           in its K-Means cluster rather than the nearest
--                           differently named one (models.deciding_dimension).
--
-- One value per model, repeated on each of its listings like demand_cluster.
-- NULL where no store publishes the counter, and for every row written by an
-- older model version. Additive: train rewrites the table each run, and the
-- existing SELECT grant to web_reader (0011) covers new columns.

ALTER TABLE listing_insights
    ADD COLUMN model_views DOUBLE PRECISION CHECK (model_views >= 0),
    ADD COLUMN model_sales_beats_pct DOUBLE PRECISION
        CHECK (model_sales_beats_pct >= 0 AND model_sales_beats_pct <= 1),
    ADD COLUMN model_normalized_price DOUBLE PRECISION CHECK (model_normalized_price > 0),
    ADD COLUMN demand_driver TEXT CHECK (demand_driver IN ('views', 'sales', 'price'));
