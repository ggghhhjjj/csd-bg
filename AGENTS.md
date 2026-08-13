# AGENTS.md — CSD-BG Free Float Scraper

Instructions for AI coding agents working in this repository.

## Purpose

TypeScript/Node.js batch app that scrapes **Free Float PDF links** from the CSD-BG website (`csd-bg.bg`), deduplicates by date in **SQLite**, optionally **appends new rows to CSV in verbose (DEBUG) mode**, **downloads PDF files** into `data/pdfs/{date}.pdf`, and **extracts** issuer/issue metrics into `stock_issue` / `issuer` / `stock_issue_daily`. Default run uses a step pipeline (`scrape,download,extract`) with **POST-based pagination** (no browser) and **early stopping** when consecutive duplicates indicate an incremental sync is complete.

Entry point: `packages/cli/dist/index.js` (source: `packages/cli/src/index.ts`). Core logic lives in `packages/core/src/`.

## Project layout

```
packages/
  core/                  # @csd-bg/core — scraper library
    src/
      app.ts             # FreeFloatScraperApp orchestrator
      pipeline.ts        # Step parse/validate/run (scrape, download, extract)
      web-scraper.ts     # fetch + cheerio, POST pagination
      pdf-downloader.ts  # PDF GET with retries + random backoff
      pdf-storage.ts     # PDF read/write under data/pdfs/
      pdf-extractor.ts   # pdfjs-dist text parse → structured rows
      database-manager.ts # SQLite (better-sqlite3)
      csv-manager.ts     # CSV columns: date, url
      settings.ts        # CSD_BG_STATISTICS_URL env resolution
    tests/               # Vitest suite
  cli/                   # @csd-bg/cli — commander CLI
  vscode/                # csd-bg-vscode — VS Code extension
tests/fixtures/          # Offline HTML/PDF golden files (shared by Vitest)
data/                    # Local CSV/DB output (gitignored)
Makefile                 # Dev commands
package.json             # npm workspaces root
vitest.config.ts         # Test runner config
Dockerfile               # Node 22 image, non-root appuser
docker-compose.yml       # One-shot scraper container, /data volume
```

Reference docs (read before changing pagination/early-stop behavior): `POST_PAGINATION_GUIDE.md`, `EARLY_STOPPING_GUIDE.md`, `README.md`.

## Environment variables (names only)

Used mainly for **Docker / Synology** deployment (see `.env.example`). The CLI loads `.env` via `dotenv` at startup; scrape requires `CSD_BG_STATISTICS_URL`.

| Variable | Role |
|----------|------|
| `DATA_HOST_PATH` | Host path mounted to `/data` in compose |
| `DOCKER_USER` | Container user `UID:GID` (default Synology-oriented) |
| `CSV_PATH` | CSV export path when verbose/DEBUG (often `/data/free_float.csv`; default: sibling of `DB_PATH`) |
| `DB_PATH` | Production DB path (often `/data/free_float.db`) |
| `PDF_DIR` | Optional PDF directory (default: sibling `pdfs/` of `DB_PATH`) |
| `TZ` | Timezone (e.g. `Europe/Sofia`) |
| `CSD_BG_STATISTICS_URL` | Full member statistics page URL for scrape (GET/POST); set in `.env`, not committed |
| `LOG_LEVEL` | Minimum log level: `ERROR`, `WARN`, `INFO`, `DEBUG` (default: `INFO`; overridden by `--log-level`). `DEBUG` also enables CSV export |

Never commit `.env`. Copy from `.env.example` locally.

## Commands

### Setup

```bash
npm install
make setup          # npm install + build + mkdir data/
make dev-setup      # same as setup
```

### Run locally

```bash
make run            # scrape,download,extract → data/free_float.db (incremental: --max-pages 5, threshold 10)
make run VERBOSE=1  # same + DEBUG logging and free_float.csv export
make run MAX_PAGES=20   # catch up after a gap
make run MAX_PAGES=2 EARLY_STOPPING_THRESHOLD=5   # match docker-compose limits
node packages/cli/dist/index.js scrape,download,extract --db ./data/free_float.db
node packages/cli/dist/index.js download --db ./data/free_float.db
node packages/cli/dist/index.js extract --db ./data/free_float.db
node packages/cli/dist/index.js scrape --db ./data/free_float.db
node packages/cli/dist/index.js scrape --verbose --db ./data/free_float.db   # also writes CSV
node packages/cli/dist/index.js --help
```

Common flags: `--verbose`, `--no-pagination`, `--max-pages N`, `--no-early-stopping`, `--early-stopping-threshold N`, `--timeout SEC`, `--download-retries N`, `--download-retry-min SEC`, `--download-retry-max SEC`, `--clear-failed-downloads`, `--clear-failed-extracts`, `--pdf-dir PATH`, `--csv PATH` (verbose only).

### Quality & tests

```bash
make test           # Vitest
make test-coverage  # Vitest with v8 coverage → coverage/
make lint           # TypeScript build (compile-as-lint)
make quality        # lint + test
make all-checks     # quality
make ci             # quality + test-coverage
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

- **Framework**: Vitest (`packages/core/tests/*.test.ts`, `vitest.config.ts`).
- **TDD**: Prefer tests with mocks/fixtures before changing scraper or storage behavior.
- **Fixtures**: `tests/fixtures/csd_home.html`, `FREE_FLOAT_*.pdf`, `FREE_FLOAT_20260723.md` — keep scraper/extractor tests offline; do not replace with live site calls in unit tests.
- **Coverage**: `npm run test:coverage` covers `packages/core/src` and `packages/cli/src`.

When adding features, extend the matching test file (`web-scraper.test.ts`, `database-manager.test.ts`, `app.test.ts`, `pipeline.test.ts`, `pdf-downloader.test.ts`, `pdf-extractor.test.ts`, `early-stopping.test.ts`).

## Architecture notes for changes

- **Pipeline**: `packages/core/src/pipeline.ts` parses `scrape,download,extract`; register future steps there and in `FreeFloatScraperApp.run`.
- **Scraper**: `WebScraper` — `fetch` + cheerio; POST pagination targets JSF form `formFF`. Preserve session/cookies and existing URL/date regex semantics unless requirements change.
- **Downloader**: `PdfDownloader` — retries with random backoff; writes `{date}.pdf` under `pdfDir`; failed URLs marked in `pdf_content` and skipped until `--clear-failed-downloads`.
- **Extractor**: `PdfExtractor` — pdfjs-dist text parse; ISIN-anchored rows; issuer names versioned in `issuer` by `(stock_issue_id, free_float_id)`.
- **DB**: `free_float` (date unique), `pdf_content` (download/extract status; legacy `content` BLOB migrated to disk), `stock_issue` (isin unique, surrogate PK), `issuer`, `stock_issue_daily`.
- **CSV**: Optional export in verbose/DEBUG mode only. Header `date,url`; append-only for new records during scrape. SQLite is the source of truth; CSV is not read back by the pipeline. Enable via `--verbose`, `--log-level DEBUG`, `LOG_LEVEL=DEBUG`, or `exportCsv: true` in the API.
- **Style**: TypeScript strict mode; domain exceptions in `errors.ts` (`WebScraperError`, `PdfDownloaderError`, `PdfExtractorError`, etc.).

## Don't touch (without explicit intent)

| Area | Why |
|------|-----|
| `.env`, secrets, real NAS paths | Local/production credentials and paths |
| `data/*.db`, `data/*.csv` | User/runtime data |
| `coverage/`, `htmlcov/`, `build/`, `*.log` | Generated artifacts (`make clean` removes many) |
| `tests/fixtures/**` | Breaking HTML/PDF/MD fixtures breaks offline tests |
| Live CSD-BG in automated tests | Flaky, rate limits, ToS; use mocks/fixtures |
| `LICENSE`, unrelated pagination markdown archives | Legal/historical docs unless task is doc-only |
| Docker `APP_UID` / `APP_GID` / Synology user defaults | Deployment-specific; change only for deploy tasks |

Do not commit `.env`. Do not run destructive git operations unless the user asks.

## Quick checklist before PR

1. `npm run build`
2. `make test` or `make test-coverage`
3. If scraper logic changed: run targeted Vitest + consider manual pagination test against live site once
