# pricewatch

IT hardware price comparison and market intelligence for Thai retailers
(IHAVECPU, JIB, BaNANA, Advice, IT City). See [CLAUDE.md](CLAUDE.md) for the
full specification.

## Status

| Layer | State |
|---|---|
| Database schema + migration runner | done (`migrations/`, `pricewatch.db`) |
| Scraping framework (rate limit, backoff, failure isolation) | done |
| Store scrapers | JIB (GPU, CPU, RAM, SSD) |
| Scheduled scraping (GitHub Actions, 09:00 / 21:00 ICT) + `scrape_runs` log | done; needs `DATABASE_URL` secret |
| Record linkage, ML pipeline, API, frontend | not started |

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
