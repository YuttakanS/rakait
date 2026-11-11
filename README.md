# pricewatch

IT hardware price comparison and market intelligence for Thai retailers
(IHAVECPU, JIB, BaNANA, IT City). See [CLAUDE.md](CLAUDE.md) for the
full specification.

## Status

| Layer | State |
|---|---|
| Database schema + migration runner | done (`migrations/`, `pricewatch.db`) |
| Scraping framework (rate limit, backoff, failure isolation) | done |
| Store scrapers | JIB, IHAVECPU, BaNANA, IT City (GPU, CPU, RAM, SSD) |
| JIB history backfill from the Wayback Machine | done (`pricewatch backfill`) |
| Scheduled scraping (GitHub Actions, every 3 h) + `scrape_runs` log | live on Supabase since 2026-11-11 |
| Data-quality warnings (empty runs, missing prices, count drops) | done (`pricewatch.quality`) |
| Record linkage: rules + calibrated TF-IDF similarity fallback | done (`pricewatch link`, `pricewatch.similarity`) |
| ML pipeline (SLR, MLR fair value, trees, K-Means) | done (`pricewatch train`, figures in `reports/figures/`) |
| Web app (Next.js) | done (`web/`) |
| ML pipeline: hierarchical clustering (Ward) vs K-Means | done |
| ML pipeline: MLR residual diagnostics (VIF, Q-Q, residual vs fitted, Jarque-Bera, Breusch-Pagan) | done (`reports/figures/*_mlr_diagnostics.png`) |
| API service (FastAPI / ONNX) | not started |

## Setup

Requires [uv](https://docs.astral.sh/uv/) and PostgreSQL 14+.

```sh
uv sync
```

## Usage

```sh
# Scrape without a database and print a summary
uv run pricewatch -v scrape --store jib --category gpu --dry-run

# Apply migrations, then scrape and persist
export DATABASE_URL=postgresql://user:pass@localhost:5432/pricewatch
uv run pricewatch migrate
uv run pricewatch scrape
```

Each `scrape` run upserts `merchant_listings`, appends one row per listing
to `price_history`, and logs one `scrape_runs` row per store and category
(listing count and error, if any). Run it on a schedule to build the time series the ML layer
needs; sales velocity is derived from the change in `sold_count` between runs.

Each run is checked before it is saved: a category that returns no listings,
mostly unpriced listings, or fewer than half its recent median count gets a
`scrape_runs.warning` and the command exits non-zero, so a merchant redesign
that breaks selectors without raising an error still fails the scheduled job.

## Development

```sh
uv run pytest
uv run ruff check .
uv run mypy
```

Database integration tests run only when `TEST_DATABASE_URL` points at a
disposable PostgreSQL database; they create and drop their own schema.

Schema changes go in a new `migrations/NNNN_name.sql` file. Applied migrations
are checksummed and must never be edited.
