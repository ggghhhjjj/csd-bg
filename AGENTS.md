# AGENTS.md — CSD-BG Free Float Scraper

Instructions for AI coding agents working in this repository.

## Purpose

Python batch app that scrapes **Free Float PDF links** from the CSD-BG website (`csd-bg.bg`), deduplicates by date in **SQLite**, appends new rows to **CSV**, **downloads PDF bytes** into `pdf_content`, and **extracts** issuer/issue metrics into `stock_issue` / `issuer` / `stock_issue_daily`. Default run uses a step pipeline (`scrape,download,extract`) with **POST-based pagination** (no browser) and **early stopping** when consecutive duplicates indicate an incremental sync is complete.

Entry point: `app.py` (`FreeFloatScraperApp`). Core logic lives in `src/`.

## Project layout

```
app.py                 # CLI, pipeline orchestration, logging (also writes app.log)
src/
  pipeline.py          # Step parse/validate/run (scrape, download, extract)
  web_scraper.py       # HTTP session, HTML parse, POST pagination
  pdf_downloader.py    # PDF GET with retries + random backoff
  pdf_extractor.py     # PDF table parse → structured rows
  database_manager.py  # SQLite free_float, pdf_content, stock_issue, issuer, stock_issue_daily
  csv_manager.py       # CSV columns: date, url
tests/                 # pytest suite + tests/fixtures/ (HTML + PDF golden files)
data/                  # Local CSV/DB output (gitignored contents typical)
Makefile               # Dev commands
pyproject.toml         # Package metadata, black/pytest config
requirements.txt       # Runtime + dev deps
Dockerfile             # python:3.11-slim, non-root appuser
docker-compose.yml     # One-shot scraper container, /data volume
```

Reference docs (read before changing pagination/early-stop behavior): `POST_PAGINATION_GUIDE.md`, `EARLY_STOPPING_GUIDE.md`, `README.md`.

## Environment variables (names only)

Used mainly for **Docker / Synology** deployment (see `.env.example`). The app CLI uses `--csv`, `--db`, `--timeout`; it does not load `.env` itself.

| Variable | Role |
|----------|------|
| `DATA_HOST_PATH` | Host path mounted to `/data` in compose |
| `DOCKER_USER` | Container user `UID:GID` (default Synology-oriented) |
| `PYTHONUNBUFFERED` | Unbuffered Python stdout/stderr |
| `PYTHONDONTWRITEBYTECODE` | No `.pyc` in container |
| `APP_TIMEOUT` | Documented app timeout (compose may pass `--timeout` instead) |
| `CSV_PATH` | Production CSV path (often `/data/free_float.csv`) |
| `DB_PATH` | Production DB path (often `/data/free_float.db`) |
| `TZ` | Timezone (e.g. `Europe/Sofia`) |
| `LOG_LEVEL` | Logging level hint for ops |

Never commit `.env`. Copy from `.env.example` locally.

## Commands

### Setup

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
make setup          # install + mkdir data/
make dev-setup      # same as install-dev (requirements include dev tools)
```

### Run locally

```bash
make run            # scrape,download,extract → data/free_float.csv + data/free_float.db
python app.py scrape,download,extract --csv ./data/free_float.csv --db ./data/free_float.db
python app.py download --db ./data/free_float.db
python app.py extract --db ./data/free_float.db
python app.py scrape --csv ./data/free_float.csv --db ./data/free_float.db
python app.py --help
```

Common flags: `--no-pagination`, `--max-pages N`, `--no-early-stopping`, `--early-stopping-threshold N`, `--timeout SEC`, `--download-retries N`, `--download-retry-min SEC`, `--download-retry-max SEC`, `--clear-failed-downloads`, `--clear-failed-extracts`.

### Quality & tests

```bash
make test           # pytest tests/ -v
make test-coverage  # pytest with cov on src/ + app.py → htmlcov/
make lint           # flake8, max line 100
make format         # black (line length 100 per pyproject.toml)
make typecheck      # mypy src/ app.py --ignore-missing-imports
make security       # bandit on src/ + app.py
make quality        # lint + typecheck + security
make all-checks     # format-check + lint + typecheck + security + test
make ci             # format-check + lint + typecheck + security + test-coverage
```

### Docker

```bash
make docker-build
make docker-run              # mount ./data → /data (default CMD: scrape,download,extract)
make docker-compose-up       # foreground
make docker-compose-up-detached
make docker-compose-down
make docker-compose-logs
make assembly                # build/csd-bg-synology.zip for NAS deploy
```

Synology / scheduled one-shot:

```bash
cd /volume2/docker/csd-bg && docker compose run --rm csd-bg-scraper scrape,download,extract
```

Compose `command` includes `scrape,download,extract` plus scrape limits (`--max-pages`, `--early-stopping-threshold`); adjust there for production batches, not in Dockerfile `CMD` alone.

## Testing conventions

- **Framework**: pytest (`tests/`, `test_*.py`, classes `Test*`, functions `test_*`).
- **Config**: `pyproject.toml` → `testpaths = ["tests"]`, `-v --strict-markers --tb=short`.
- **TDD**: Prefer tests with mocks/fixtures before changing scraper or storage behavior.
- **Fixtures**: `tests/fixtures/csd_home.html`, `FREE_FLOAT_*.pdf`, `FREE_FLOAT_20260723.md` — keep scraper/extractor tests offline; do not replace with live site calls in unit tests.
- **Coverage**: Include `src/` and `app.py` (see `make test-coverage`).
- **Root script**: `test_pagination_live.py` hits the real site — run manually only, not in CI.

When adding features, extend the matching module test file (`test_web_scraper.py`, `test_database_manager.py`, `test_csv_manager.py`, `test_app.py`, `test_pipeline.py`, `test_pdf_downloader.py`, `test_pdf_extractor.py`, plus behavior tests like `test_early_stopping.py`).

## Architecture notes for changes

- **Pipeline**: `src/pipeline.py` parses `scrape,download,extract`; register future steps there and in `app.run` handlers.
- **Scraper**: `WebScraper` — `requests` + BeautifulSoup; POST pagination targets JSF form `formFF`. Preserve session/cookies and existing URL/date regex semantics unless requirements change.
- **Downloader**: `PdfDownloader` — retries with random backoff; failed URLs marked in `pdf_content` and skipped until `--clear-failed-downloads`.
- **Extractor**: `PdfExtractor` — pdfplumber text parse; ISIN-anchored rows; issuer names versioned in `issuer` by `(stock_issue_id, free_float_id)`.
- **DB**: `free_float` (date unique), `pdf_content` (BLOB + download/extract status), `stock_issue` (isin unique, surrogate PK), `issuer`, `stock_issue_daily`.
- **CSV**: Header `date,url`; append-only for new records; required only for scrape step.
- **Style**: Black 100 cols, type hints expected, domain exceptions (`WebScraperError`, `PdfDownloaderError`, `PdfExtractorError`, etc.).

## Don't touch (without explicit intent)

| Area | Why |
|------|-----|
| `.env`, secrets, real NAS paths | Local/production credentials and paths |
| `data/*.db`, `data/*.csv` | User/runtime data |
| `.coverage`, `htmlcov/`, `build/`, `*.log` | Generated artifacts (`make clean` removes many) |
| `tests/fixtures/**` | Breaking HTML/PDF/MD fixtures breaks offline tests |
| Live CSD-BG in automated tests | Flaky, rate limits, ToS; use mocks/fixtures |
| `LICENSE`, unrelated pagination markdown archives | Legal/historical docs unless task is doc-only |
| Docker `APP_UID` / `APP_GID` / Synology user defaults | Deployment-specific; change only for deploy tasks |

Do not commit `.env`. Do not run destructive git operations unless the user asks.

## Quick checklist before PR

1. `make format` (or `format-check` in CI)
2. `make lint` && `make typecheck` && `make security`
3. `make test` or `make test-coverage`
4. If scraper logic changed: run targeted pytest + consider manual `test_pagination_live.py` once
