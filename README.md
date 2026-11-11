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
| Scheduled scraping (GitHub Actions on a self-hosted runner, every 3 h) + `scrape_runs` log | live on Supabase since 2026-11-11 |
| Data-quality warnings (empty runs, missing prices, count drops) | done (`pricewatch.quality`) |
| Record linkage: rules + calibrated TF-IDF similarity fallback | done (`pricewatch link`, `pricewatch.similarity`) |
| ML pipeline (SLR, MLR fair value, trees, K-Means) | done (`pricewatch train`, figures in `reports/figures/`) |
| Web app (Next.js) | done (`web/`) |
| ML pipeline: hierarchical clustering (Ward) vs K-Means | done |
| ML pipeline: MLR residual diagnostics (VIF, Q-Q, residual vs fitted, Jarque-Bera, Breusch-Pagan) | done (`reports/figures/*_mlr_diagnostics.png`) |
| ML pipeline: fair value fitted on in-stock listings, launch-year features, prediction-interval Deal Score with an extrapolation guard (leverage > 1 → unscored) | done (model `2026.11-v2`) |
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

### Scheduled runs on a self-hosted runner

`.github/workflows/scrape.yml` runs `migrate → scrape → link → train` every
3 hours. IHAVECPU and BaNANA answer HTTP 403 to GitHub-hosted runners
(datacenter IPs), so the job targets a self-hosted Windows runner labelled
`pricewatch`. Install it once from an elevated PowerShell (needs `gh auth login`
with admin rights on the repository):

```powershell
powershell -ExecutionPolicy Bypass -File scripts\setup-runner.ps1
gh workflow run scrape.yml   # first run, to check
```

The script verifies the runner's SHA-256 against the release notes and installs
it as a Windows service. The job needs the `DATABASE_URL` repository secret.
Runs queue while the machine is off or asleep and start when it is back.

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
