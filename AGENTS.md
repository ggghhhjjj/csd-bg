# AGENTS.md — CSD-BG Free Float Scraper

Instructions for AI coding agents working in this repository.

## Purpose

Python batch app that scrapes **Free Float PDF links** from the CSD-BG website (`csd-bg.bg`), deduplicates by date in **SQLite**, and appends new rows to **CSV**. Default run uses **POST-based pagination** (no browser) with **early stopping** when consecutive duplicates indicate an incremental sync is complete.

Entry point: `app.py` (`FreeFloatScraperApp`). Core logic lives in `src/`.

## Project layout

```
app.py                 # CLI, orchestration, logging (also writes app.log)
src/
  web_scraper.py       # HTTP session, HTML parse, POST pagination
  database_manager.py  # SQLite table free_float (date, url)
  csv_manager.py       # CSV columns: date, url
tests/                 # pytest suite + tests/fixtures/ (saved HTML)
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
make run            # data/free_float.csv + data/free_float.db, pagination defaults on
python app.py --csv ./data/free_float.csv --db ./data/free_float.db
python app.py --help
```

Common flags: `--no-pagination`, `--max-pages N`, `--no-early-stopping`, `--early-stopping-threshold N`, `--timeout SEC`.

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
make docker-run              # mount ./data → /data
make docker-compose-up       # foreground
make docker-compose-up-detached
make docker-compose-down
make docker-compose-logs
make assembly                # build/csd-bg-synology.zip for NAS deploy
```

Compose `command` overrides default scrape limits (`--max-pages`, `--early-stopping-threshold`); adjust there for production batches, not in Dockerfile `CMD` alone.

## Testing conventions

- **Framework**: pytest (`tests/`, `test_*.py`, classes `Test*`, functions `test_*`).
- **Config**: `pyproject.toml` → `testpaths = ["tests"]`, `-v --strict-markers --tb=short`.
- **TDD**: Prefer tests with mocks/fixtures before changing scraper or storage behavior.
- **Fixtures**: `tests/fixtures/csd_home.html` and related files — keep scraper tests offline; do not replace with live site calls in unit tests.
- **Coverage**: Include `src/` and `app.py` (see `make test-coverage`).
- **Root script**: `test_pagination_live.py` hits the real site — run manually only, not in CI.

When adding features, extend the matching module test file (`test_web_scraper.py`, `test_database_manager.py`, `test_csv_manager.py`, `test_app.py`, plus behavior tests like `test_early_stopping.py`).

## Architecture notes for changes

- **Scraper**: `WebScraper` — `requests` + BeautifulSoup; POST pagination targets JSF form `formFF`. Preserve session/cookies and existing URL/date regex semantics unless requirements change.
- **DB**: Table `free_float`, uniqueness by `date`. Context manager on `DatabaseManager`.
- **CSV**: Header `date,url`; append-only for new records.
- **Style**: Black 100 cols, type hints expected, domain exceptions (`WebScraperError`, etc.).

## Don't touch (without explicit intent)

| Area | Why |
|------|-----|
| `.env`, secrets, real NAS paths | Local/production credentials and paths |
| `data/*.db`, `data/*.csv` | User/runtime data |
| `.coverage`, `htmlcov/`, `build/`, `*.log` | Generated artifacts (`make clean` removes many) |
| `tests/fixtures/**` | Breaking HTML breaks offline scraper tests |
| Live CSD-BG in automated tests | Flaky, rate limits, ToS; use mocks/fixtures |
| `LICENSE`, unrelated pagination markdown archives | Legal/historical docs unless task is doc-only |
| Docker `APP_UID` / `APP_GID` / Synology user defaults | Deployment-specific; change only for deploy tasks |

Do not commit `.env`. Do not run destructive git operations unless the user asks.

## Quick checklist before PR

1. `make format` (or `format-check` in CI)
2. `make lint` && `make typecheck` && `make security`
3. `make test` or `make test-coverage`
4. If scraper logic changed: run targeted pytest + consider manual `test_pagination_live.py` once
