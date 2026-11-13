-- 0014_demand_label_fit
-- Whether a model's own numbers support the name of its demand group
-- (pricewatch train, model 2026.11-v15; SPEC round 17).
--
-- K-Means groups on views, sales and price at once, so on the live catalogue
-- most cards of "คนดูเยอะ แต่ขายน้อย" carried numbers that contradicted the
-- badge beside them. The rule that decides it (ml/models.py label_fit: the
-- sales share against a 50% bar, views against the best-seller split or the
-- all-model median, on the numbers as the web prints them) lives in the
-- pipeline only; the web shows a group's badge, filters by it and counts it
-- only where the flag is true, and never re-evaluates the rule.
--
--   demand_label_fits  true: the numbers support the group's name.
--                      false: they do not; the model keeps demand_cluster
--                      (what K-Means assigned, explained on its product
--                      page) but carries no badge and is not listed under
--                      the group.
--                      NULL: no group, or a row from before 2026.11-v15
--                      (the web then shows the badge as before).
--   demand_label_miss  Which numbers fail the name when the flag is false.
--
-- One value per model, repeated on each of its listings like demand_cluster.
-- Additive: train rewrites the table each run, and the existing SELECT grant
-- to web_reader (0011) covers new columns.

ALTER TABLE listing_insights
    ADD COLUMN demand_label_fits BOOLEAN,
    ADD COLUMN demand_label_miss TEXT CHECK (demand_label_miss IN ('views', 'sales', 'both')),
    ADD CONSTRAINT listing_insights_label_miss_only_when_unfit
        CHECK (demand_label_miss IS NULL OR demand_label_fits IS FALSE);
