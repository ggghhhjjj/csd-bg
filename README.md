# CSD-BG Free Float Scraper

[![Node.js 20+](https://img.shields.io/badge/node-20+-339933.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/typescript-5.x-3178c6.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A TypeScript/Node.js application that scrapes Free Float PDF links from the CSD-BG (Central Securities Depository Bulgaria) website, stores them in SQLite, downloads PDF bytes, and extracts issuer metrics. Ships as a **CLI**, **Docker** one-shot batch job, and **VS Code extension**.

## Features

- **Web scraping** — Extract Free Float PDF links from the CSD-BG statistics page
- **POST-based pagination** — Scrape all pages via JSF AJAX POST (no browser)
- **Step pipeline** — `scrape`, `download`, `extract` with early stopping on duplicates
- **SQLite + optional CSV export** — Deduplicated metadata in SQLite; human-readable CSV only in verbose (DEBUG) mode
- **Docker / Synology** — One-shot container with `/data` volume
- **GitHub Actions** — Daily scheduled scrape with data committed to `main` via Git LFS
- **VS Code extension** — Run pipeline, browse dates/issuers, charts, config editor
- **Web client** — Angular + Cordova-browser PWA under `web/` (not an npm workspace)
- **Offline tests** — Vitest suite with HTML/PDF fixtures (no live site in CI)

## Table of Contents

- [Requirements](#requirements)
- [Quick Start](#quick-start)
- [Installation](#installation)
- [Usage](#usage)
  - [CLI](#cli)
  - [Make targets](#make-targets)
  - [Docker](#docker)
  - [Docker Compose / Synology](#docker-compose--synology)
  - [VS Code extension](#vs-code-extension)
- [Pipeline workflow](#pipeline-workflow)
- [Project structure](#project-structure)
- [Development](#development)
- [Testing](#testing)
- [Deployment](#deployment)
  - [GitHub Actions (production)](#github-actions-production)
  - [Synology DSM](#synology-dsm)
  - [AWS / other](#aws--other)
- [Configuration](#configuration)
- [Database schema](#database-schema)
- [Troubleshooting](#troubleshooting)
- [License](#license)

## Requirements

- **Node.js 20+** (default runtime)
- **npm** (workspaces monorepo)
- **Docker / Docker Compose** (optional, recommended for NAS/production)

## Quick Start

```bash
git clone <repository-url>
cd csd-bg

cp .env.example .env
# Edit .env and set CSD_BG_STATISTICS_URL

npm install
npm run build

mkdir -p data
node packages/cli/dist/index.js scrape,download,extract,vectors \
  --db ./data/free_float.db \
  --log ./data/app.log
```

Or use Make (incremental defaults: `--max-pages 5`, `--early-stopping-threshold 10`):

```bash
make setup   # npm install + build
make run     # full pipeline to ./data/ (limited pagination for daily-style sync)
make run VERBOSE=1   # same + DEBUG logging and CSV export
make run MAX_PAGES=20   # catch up after a gap
```

## Installation

### Local (Node.js)

```bash
npm install
npm run build
```

Build compiles:

| Package | Output |
|---------|--------|
| `@csd-bg/core` | `packages/core/dist/` |
| `@csd-bg/cli` | `packages/cli/dist/index.js` |
| `csd-bg-vscode` | `packages/vscode/dist/extension.js` |

### Docker

No local Node install required if you only run via Docker. Ensure Docker and Docker Compose are installed.

## Usage

### CLI

Entry point after build:

```bash
node packages/cli/dist/index.js [steps] --db <path> [options]
# or
npm run csd-bg -- [steps] --db <path> [options]
```

**Steps** (comma-separated, default: `scrape,download,extract,vectors`):

| Step | Description |
|------|-------------|
| `scrape` | Discover PDF links, write SQLite (CSV in verbose mode only) |
| `download` | Fetch pending PDFs into `data/pdfs/{date}.pdf` |
| `extract` | Parse PDFs into `stock_issue` / `issuer` / `stock_issue_daily` |
| `vectors` | Export Arrow vectors + catalog for offline charting (`data/vectors/`) |

**Common options**:

| Flag | Description |
|------|-------------|
| `-v, --verbose` | Enable DEBUG logging and CSV export of scraped records |
| `--csv <path>` | CSV export path (**verbose mode only**; default: `free_float.csv` next to `--db`, or `CSV_PATH` env) |
| `--db <path>` | SQLite database path (**required**) |
| `--log <path>` | Log file (default: `/data/app.log`) |
| `--log-level <level>` | Minimum log level: `ERROR`, `WARN`, `INFO`, `DEBUG` (default: `INFO`; CLI overrides `LOG_LEVEL` env). `DEBUG` also enables CSV export (same as `--verbose`) |
| `--timeout <sec>` | HTTP timeout (default: 30) |
| `--no-pagination` | First page only (pagination is on by default) |
| `--max-pages <n>` | Limit pagination pages |
| `--no-early-stopping` | Process all scraped links even when duplicates accumulate |
| `--early-stopping-threshold <n>` | Consecutive duplicates before scrape stops (default: 10) |
| `--download-retries <n>` | PDF download attempts (default: 3) |
| `--download-retry-min` / `--max` | Backoff seconds between retries (default: 10–30) |
| `--clear-failed-downloads` | Retry previously failed downloads |
| `--clear-failed-extracts` | Retry previously failed extractions |
| `--pdf-dir <path>` | PDF storage directory (default: sibling `pdfs/` of `--db`) |
| `--vectors-dir <path>` | Arrow vector export directory (default: sibling `vectors/` of `--db`) |

**Environment**: copy `.env.example` → `.env` and set `CSD_BG_STATISTICS_URL` (required for scrape). Optional `LOG_LEVEL` sets default verbosity. Loaded automatically via `dotenv`.

**Examples**:

```bash
# Full pipeline (typical daily / Synology job)
node packages/cli/dist/index.js scrape,download,extract,vectors \
  --db ./data/free_float.db \
  --log ./data/app.log

# Scrape only (incremental; early stopping on by default)
node packages/cli/dist/index.js scrape \
  --db ./data/free_float.db

# Verbose scrape — also writes free_float.csv next to the database
node packages/cli/dist/index.js scrape \
  --verbose \
  --db ./data/free_float.db

# Catch up downloads / extracts / vectors
node packages/cli/dist/index.js download --db ./data/free_float.db
node packages/cli/dist/index.js extract --db ./data/free_float.db
node packages/cli/dist/index.js vectors --db ./data/free_float.db

# Full historical scrape (no early stop)
node packages/cli/dist/index.js scrape \
  --db ./data/free_float.db \
  --no-early-stopping

# Limited pagination test
node packages/cli/dist/index.js scrape \
  --db ./data/free_float.db \
  --max-pages 5
```

### Make targets

| Target | Description |
|--------|-------------|
| `make setup` | `npm install` + build |
| `make run` | Full Node pipeline → `./data/` with **incremental scrape limits** (`--max-pages 5`, `--early-stopping-threshold 10`) |
| `make run VERBOSE=1` | Same, with DEBUG logging and CSV export |
| `make run MAX_PAGES=N` | Override page limit (e.g. `MAX_PAGES=20` after a gap) |
| `make run EARLY_STOPPING_THRESHOLD=N` | Override consecutive-duplicate threshold |
| `make run-timeout` | Same as `make run`, with `--timeout 60` |
| `make test` | Vitest |
| `make test-coverage` | Vitest with coverage |
| `make build` | `npm run build` |
| `make docker-build` | Build Docker image |
| `make docker-compose-up` | Foreground compose run |
| `make assembly` | Zip for Synology deploy |

**Incremental vs full scrape:** `make run` is tuned for regular updates when the database already has history—it fetches at most 5 pages (~50 links) and stops processing after 10 consecutive duplicate dates. For a **first-time full import**, call the CLI directly with `--no-early-stopping` and no `--max-pages` limit (see [CLI examples](#cli)).

Run `make help` for the full list.

### Docker

```bash
docker build -t csd-bg-scraper:latest .

docker run --rm \
  -v "$(pwd)/data:/data" \
  --env-file .env \
  csd-bg-scraper:latest \
  scrape,download,extract,vectors \
  --db /data/free_float.db \
  --log /data/app.log
```

The image uses **Node 22** and entrypoint `node packages/cli/dist/index.js`.

### Docker Compose / Synology

```bash
mkdir -p data
cp .env.example .env   # set CSD_BG_STATISTICS_URL and DATA_HOST_PATH

docker compose run --rm csd-bg-scraper scrape,download,extract,vectors
```

Compose mounts `${DATA_HOST_PATH:-./data}` → `/data` and passes pipeline args in `docker-compose.yml` (including `--max-pages 2` and `--early-stopping-threshold 5` for scheduled incremental runs). Adjust `command`, memory limits, and `DOCKER_USER` there for production. Local `make run` uses a slightly higher default (`MAX_PAGES=5`)—see [Make targets](#make-targets).

### VS Code extension

Package: `packages/vscode` (`csd-bg-vscode`)

**Development**:

1. `npm install && npm run build`
2. Open repo in VS Code
3. Run **Run Extension** from `packages/vscode/.vscode/launch.json` (F5)

**Features**:

- Activity bar: Pipeline, Dates, Issuers tree views
- Commands: run full pipeline or individual steps
- Webviews: data table explorer, Chart.js issuer trends, config editor
- Settings: `csd-bg.statisticsUrl`, `csd-bg.dataDirectory`, timeout, pagination
- Generate cron/Docker snippet for headless NAS scheduling

**Settings** (workspace):

| Setting | Description |
|---------|-------------|
| `csd-bg.statisticsUrl` | Same as `CSD_BG_STATISTICS_URL` |
| `csd-bg.dataDirectory` | Folder for CSV/DB/logs (default `./data`) |
| `csd-bg.timeout` | HTTP timeout |
| `csd-bg.maxPages` | `0` = all pages |
| `csd-bg.earlyStoppingThreshold` | Consecutive duplicate limit |
| `csd-bg.usePostPagination` | POST pagination (default `true`) |
| `csd-bg.enableEarlyStopping` | Early stop on scrape (default `true`) |
| `csd-bg.logLevel` | Minimum log level for output and `app.log` (default `INFO`). `DEBUG` also enables CSV export during scrape |

## Pipeline workflow

Default production command:

```bash
docker compose run --rm csd-bg-scraper scrape,download,extract,vectors
```

### Step: `scrape`

1. Load statistics page (`CSD_BG_STATISTICS_URL`)
2. POST paginate through JSF form `formFF` until empty pages or `--max-pages`
3. For each link: skip if date exists; optionally **early-stop** after N consecutive duplicates
4. Insert new rows into `free_float`; in **verbose mode** (`--verbose` or `--log-level DEBUG`), also append CSV (`date,url`)

### Step: `download`

1. Optionally clear failed marks (`--clear-failed-downloads`)
2. For each `free_float` row without `pdf_content`: GET PDF with retries + backoff
3. Store file at `{pdfDir}/{date}.pdf` and mark metadata in `pdf_content`, or mark `status=failed`

### Step: `extract`

1. Optionally clear failed extract marks (`--clear-failed-extracts`)
2. Parse pending downloaded PDFs from disk (pdfjs-dist + regex, validated against fixtures)
3. Upsert `stock_issue`, `issuer`, `stock_issue_daily`
4. Set `extract_status=extracted` or `failed`

## Project structure

```
csd-bg/
├── packages/
│   ├── core/                 # @csd-bg/core — scraper, DB, PDF, pipeline
│   │   ├── src/
│   │   └── tests/            # Vitest (uses tests/fixtures)
│   ├── cli/                  # @csd-bg/cli — commander entrypoint
│   │   └── src/index.ts
│   └── vscode/               # csd-bg-vscode extension
│       └── src/extension.ts
├── web/                      # Angular 22 + Cordova-browser client (isolated npm project)
├── tests/fixtures/           # Offline HTML/PDF golden files (shared)
├── data/                     # Local CSV/DB/PDF output (gitignored)
├── package.json              # npm workspaces root
├── vitest.config.ts
├── Dockerfile                # Node 22 image
├── docker-compose.yml
├── Makefile
└── README.md
```

## Development

```bash
npm install
npm run build        # compile all packages
npm test             # Vitest
npm run test:watch   # watch mode
```

### TypeScript API (library)

```typescript
import { FreeFloatScraperApp, WebScraper, PdfExtractor } from "@csd-bg/core";

const app = new FreeFloatScraperApp({
  dbPath: "./data/free_float.db",
  exportCsv: true, // optional; set true to write CSV during scrape (CLI: --verbose)
  csvPath: "./data/free_float.csv", // optional override when exportCsv is true
  statisticsUrl: process.env.CSD_BG_STATISTICS_URL,
});

const result = await app.run(["scrape", "download", "extract"]);
console.log(result.exitCode, result.scrape, result.download, result.extract);
```

### POST pagination notes

- Pagination is **enabled by default** (use `--no-pagination` for first page only)
- Early stopping is **on by default** for incremental syncs (disabled when DB is empty)
- See also: [POST_PAGINATION_GUIDE.md](POST_PAGINATION_GUIDE.md), [EARLY_STOPPING_GUIDE.md](EARLY_STOPPING_GUIDE.md)

## Testing

```bash
npm test                    # Vitest
npm run test:coverage       # Vitest with coverage
npm run test:watch
```

Vitest includes:

- Pipeline step parsing and early stopping
- CSV / settings / DB tests
- Web scraper pagination and link extraction (`tests/fixtures/csd_home.html`)
- PDF downloader retries and validation
- **PDF golden test** — extracted rows must match `tests/fixtures/FREE_FLOAT_20260723.md`

Do not call the live CSD-BG site from automated tests.

## Deployment

### GitHub Actions (production)

The recommended production setup runs on **GitHub-hosted Actions** daily at **19:00 Europe/Sofia** via [`.github/workflows/daily-scrape.yml`](.github/workflows/daily-scrape.yml). The workflow scrapes, downloads, and extracts, then commits `data/free_float.db` and new PDFs to `main` using **Git LFS**.

#### One-time setup

1. **Repository secret** — Settings → Secrets and variables → Actions → add `CSD_BG_STATISTICS_URL` (full member statistics page URL, same as local `.env`).

2. **Branch protection** — Allow `github-actions[bot]` to push to `main`, or use a fine-grained PAT stored as `DATA_PUSH_TOKEN` and pass it to `actions/checkout` if pushes are blocked.

3. **Watch for failures** — On GitHub.com, open the repo → **Watch** → **Custom** → enable **Actions** (or **All activity**). GitHub emails you when a scheduled run fails, with a link to the run.

4. **Git LFS** — `data/free_float.db` and `data/pdfs/*.pdf` are LFS objects ([`.gitattributes`](.gitattributes)). Monitor usage under **Settings → Billing → Git LFS** ([GitHub LFS billing docs](https://docs.github.com/en/billing/concepts/product-billing/git-lfs)). Free/Pro includes 10 GiB storage and 10 GiB bandwidth per month.

#### What the workflow does

| Phase | Behavior |
|-------|----------|
| Data sync | Checkout with `lfs: false` (pointer files only); restore `.git/lfs` from Actions cache; `git lfs pull` materializes `data/` from local LFS objects (remote fetch only for OIDs not in cache). |
| Pipeline | `scrape,download,extract,vectors` with `--max-pages 5`, `--early-stopping-threshold 10` |
| Commit | Push only if `data/free_float.db` changed (includes new PDFs in the same commit) |
| Partial failure | DB changes are still committed; job status remains **Failed** if the pipeline exited non-zero |
| Cache | Saved only after a fully successful run |

#### Manual run

Actions → **Daily Scrape** → **Run workflow** (`workflow_dispatch`).

#### Failure notification

When any step fails (including Git LFS quota errors at checkout or push):

1. **Watch email** — link to the failed run (GitHub does not embed log text in the email).
2. **`app.log` artifact** — download from the run page (7-day retention; may be missing if failure occurred before the pipeline ran).
3. **Job summary** — step outcomes, last 200 lines of `app.log` when present, and an LFS quota hint when checkout or push fails.

After a failure, you can push manual corrections to `data/` on `main`; the next run’s `git lfs pull` downloads only LFS objects not already in the cached `.git/lfs` store.

### Synology DSM

Alternative on-prem deployment (not required when using GitHub Actions):

1. Copy repo or `make assembly` → `build/csd-bg-synology.zip`
2. Unzip on NAS, configure `.env` (`CSD_BG_STATISTICS_URL`, `DATA_HOST_PATH`, `DOCKER_USER`)
3. Schedule: `docker compose run --rm csd-bg-scraper scrape,download,extract,vectors`

### AWS / other

Same Docker image — push to ECR/ACR and run as a scheduled task (EventBridge, cron, etc.) with a persistent volume for `/data`.

## Configuration

### Environment variables

| Variable | Role |
|----------|------|
| `CSD_BG_STATISTICS_URL` | Full member statistics page URL (**required for scrape**) |
| `DATA_HOST_PATH` | Host path mounted to `/data` in compose |
| `DOCKER_USER` | Container `UID:GID` (Synology) |
| `CSV_PATH` | CSV export path when verbose (often `/data/free_float.csv`; default: sibling of `DB_PATH`) |
| `DB_PATH` | Production DB path (often `/data/free_float.db`) |
| `PDF_DIR` | Optional PDF directory (default: `{dirname(DB_PATH)}/pdfs`) |
| `LOG_LEVEL` | Minimum log level: `ERROR`, `WARN`, `INFO`, `DEBUG` (default: `INFO`) |
| `TZ` | Timezone (e.g. `Europe/Sofia`) |

Copy [.env.example](.env.example) to `.env` locally. Never commit `.env`.

## Database schema

### Table: `free_float`

| Column     | Type      | Description                       |
|------------|-----------|-----------------------------------|
| id         | INTEGER   | Primary key                       |
| date       | TEXT      | YYYY-MM-DD (unique)               |
| url        | TEXT      | Full PDF URL                      |
| created_at | TIMESTAMP | Created at                        |

### Table: `pdf_content`

| Column             | Type      | Description                          |
|--------------------|-----------|--------------------------------------|
| free_float_id      | INTEGER   | PK / FK → `free_float.id`            |
| size_bytes         | INTEGER   | Content length                       |
| status             | TEXT      | `downloaded` or `failed`             |
| attempts           | INTEGER   | Download attempts                    |
| last_error         | TEXT      | Last download error                  |
| extract_status     | TEXT      | `extracted`, `failed`, or NULL       |
| extract_attempts   | INTEGER   | Extract attempts                     |
| extract_last_error | TEXT      | Last extract error                   |
| downloaded_at      | TIMESTAMP | Download success time                |
| extracted_at       | TIMESTAMP | Extract success time                 |
| created_at         | TIMESTAMP | Row created                          |
| updated_at         | TIMESTAMP | Last update                          |

PDF files live at `{pdfDir}/{date}.pdf` (default `data/pdfs/` next to the database). Download/extract metadata is stored in `pdf_content`.

### Table: `stock_issue`

| Column     | Type      | Description              |
|------------|-----------|--------------------------|
| id         | INTEGER   | Surrogate PK             |
| isin       | TEXT      | Unique ISIN (Емисия)     |
| created_at | TIMESTAMP | Created at               |

### Table: `issuer`

| Column         | Type      | Description                    |
|----------------|-----------|--------------------------------|
| id             | INTEGER   | Surrogate PK                   |
| stock_issue_id | INTEGER   | FK → `stock_issue.id`          |
| free_float_id  | INTEGER   | FK → `free_float.id` (date)    |
| name           | TEXT      | Issuer name on that date       |

### Table: `stock_issue_daily`

| Column         | Type      | Description           |
|----------------|-----------|-----------------------|
| stock_issue_id | INTEGER   | FK → `stock_issue.id` |
| free_float_id  | INTEGER   | FK → `free_float.id`  |
| total_shares   | INTEGER   | Общ Брой Фи           |
| free_float     | INTEGER   | Фрий Флоат            |
| shareholders   | INTEGER   | Брой Акционери        |

## Vector export (`vectors` step)

After extract, the pipeline exports chart-ready artifacts under `data/vectors/` (or `--vectors-dir` / `VECTORS_DIR`):

| File | Description |
|------|-------------|
| `catalog.json` | Static `{ id, isin, name }` mapping (not vectorized) |
| `manifest.json` | Bootstrap metadata (counts, date range, file names) |
| `dates.arrow` | Shared report-date axis (LZ4 IPC, Date32 column) |
| `free_float_vectors.arrow` | Numeric series only: `total_shares`, `free_float`, `shareholders` as FixedSizeList&lt;Int32&gt; per issuer |

Row index `i` in the series file maps to `catalog.issuers[i]`. `catalog.issuers[i].id` is the database primary key and may be non-contiguous; always resolve series rows by catalog index or lookup, not by `id - 1`. Missing `(issuer, date)` cells are Arrow nulls. Read with [`apache-arrow`](https://arrow.apache.org/docs/js/) in Node or the browser.

The weekday scrape commits these files to `main`. The web client does **not** copy them into `www/`; it fetches the four URLs in [`web/public/assets/vectors.config.json`](web/public/assets/vectors.config.json) once, then caches them.

## Web client (`web/`)

Isolated Angular 22 + Apache Cordova (`cordova-browser`) app. **Not** an npm workspace package. Sources live in `web/src/`; `web/www/` is generated (gitignored).

```bash
cd web
npm install          # Node 24 (Angular 22)
npm start            # ng serve; toggle EN/BG via localStorage + reload
npm run build        # single production app → www/
npm test
npm run cordova:run  # before_prepare hook runs npm run build
```

GitHub Pages deploys `web/www` via [`.github/workflows/pages.yml`](.github/workflows/pages.yml) when `web/**` changes. Vector URL edits belong in `web/public/assets/vectors.config.json`. Old `/en/` and `/bg/` Pages bookmarks 404.

## CSV export (verbose mode)

CSV is **optional**. Normal runs (`INFO` level) use SQLite only. Enable CSV when you want a plain-text audit log of newly scraped links:

| Trigger | CSV written? |
|---------|----------------|
| Default (`INFO`) | No |
| `--verbose` | Yes |
| `--log-level DEBUG` | Yes |
| `LOG_LEVEL=DEBUG` in `.env` | Yes |
| VS Code `csd-bg.logLevel` = `DEBUG` | Yes |

When enabled, the file is append-only with header `date,url`. Path resolution: `--csv` → `CSV_PATH` env → `{dirname(--db)}/free_float.csv`.

The database remains the source of truth. The app does **not** read CSV back for deduplication, download, or extract.

### CSV format

| Column | Description        |
|--------|--------------------|
| date   | YYYY-MM-DD         |
| url    | Full PDF URL       |

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `CSD_BG_STATISTICS_URL is not set` | Copy `.env.example` → `.env` or pass URL via VS Code setting |
| Permission denied on `/data` | Fix volume ownership (`DOCKER_USER` / `chown` on host path) |
| HTTP timeouts | Increase `--timeout 60` |
| Failed PDFs stuck | `download --clear-failed-downloads` or `extract --clear-failed-extracts` |
| Docker build fails on `better-sqlite3` | Image installs `python3 make g++` for native module compile |
| VS Code extension: empty trees | Run pipeline once; check `csd-bg.dataDirectory` points at your DB |

## Contributing

1. Fork the repository
2. Create a feature branch
3. `npm test`
4. Open a Pull Request

## License

MIT — see [LICENSE](LICENSE).

---

**Note**: For educational and data collection purposes. Comply with the website terms of service and applicable laws.
