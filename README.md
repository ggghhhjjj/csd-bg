# CSD-BG Free Float Scraper

[![Node.js 20+](https://img.shields.io/badge/node-20+-339933.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/typescript-5.x-3178c6.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A TypeScript/Node.js application that scrapes Free Float PDF links from the CSD-BG (Central Securities Depository Bulgaria) website, stores them in SQLite, downloads PDF bytes, and extracts issuer metrics. Ships as a **CLI**, **Docker** one-shot batch job, and **VS Code extension**.

## Features

- **Web scraping** — Extract Free Float PDF links from the CSD-BG statistics page
- **POST-based pagination** — Scrape all pages via JSF AJAX POST (no browser)
- **Step pipeline** — `scrape`, `download`, `extract` with early stopping on duplicates
- **SQLite + CSV** — Deduplicated metadata, BLOB storage, structured extract tables
- **Docker / Synology** — One-shot container with `/data` volume
- **VS Code extension** — Run pipeline, browse dates/issuers, charts, config editor
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
node packages/cli/dist/index.js scrape,download,extract \
  --csv ./data/free_float.csv \
  --db ./data/free_float.db \
  --log ./data/app.log
```

Or use Make:

```bash
make setup   # npm install + build
make run     # full pipeline to ./data
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

**Steps** (comma-separated, default: `scrape,download,extract`):

| Step | Description |
|------|-------------|
| `scrape` | Discover PDF links, write SQLite + CSV |
| `download` | Fetch pending PDFs into `pdf_content` BLOBs |
| `extract` | Parse PDFs into `stock_issue` / `issuer` / `stock_issue_daily` |

**Common options**:

| Flag | Description |
|------|-------------|
| `--csv <path>` | CSV output path (**required** when `scrape` is included) |
| `--db <path>` | SQLite database path (**required**) |
| `--log <path>` | Log file (default: `/data/app.log`) |
| `--log-level <level>` | Minimum log level: `ERROR`, `WARN`, `INFO`, `DEBUG` (default: `INFO`; CLI overrides `LOG_LEVEL` env) |
| `--timeout <sec>` | HTTP timeout (default: 30) |
| `--no-pagination` | First page only (pagination is on by default) |
| `--max-pages <n>` | Limit pagination pages |
| `--no-early-stopping` | Process all scraped links even when duplicates accumulate |
| `--early-stopping-threshold <n>` | Consecutive duplicates before scrape stops (default: 10) |
| `--download-retries <n>` | PDF download attempts (default: 3) |
| `--download-retry-min` / `--max` | Backoff seconds between retries (default: 10–30) |
| `--clear-failed-downloads` | Retry previously failed downloads |
| `--clear-failed-extracts` | Retry previously failed extractions |

**Environment**: copy `.env.example` → `.env` and set `CSD_BG_STATISTICS_URL` (required for scrape). Optional `LOG_LEVEL` sets default verbosity. Loaded automatically via `dotenv`.

**Examples**:

```bash
# Full pipeline (typical daily / Synology job)
node packages/cli/dist/index.js scrape,download,extract \
  --csv ./data/free_float.csv \
  --db ./data/free_float.db \
  --log ./data/app.log

# Scrape only (incremental; early stopping on by default)
node packages/cli/dist/index.js scrape \
  --csv ./data/free_float.csv \
  --db ./data/free_float.db

# Catch up downloads / extracts
node packages/cli/dist/index.js download --db ./data/free_float.db
node packages/cli/dist/index.js extract --db ./data/free_float.db

# Full historical scrape (no early stop)
node packages/cli/dist/index.js scrape \
  --csv ./data/free_float.csv \
  --db ./data/free_float.db \
  --no-early-stopping

# Limited pagination test
node packages/cli/dist/index.js scrape \
  --csv ./data/free_float.csv \
  --db ./data/free_float.db \
  --max-pages 5
```

### Make targets

| Target | Description |
|--------|-------------|
| `make setup` | `npm install` + build |
| `make run` | Full Node pipeline → `./data/` |
| `make test` | Vitest |
| `make test-coverage` | Vitest with coverage |
| `make build` | `npm run build` |
| `make docker-build` | Build Docker image |
| `make docker-compose-up` | Foreground compose run |
| `make assembly` | Zip for Synology deploy |

Run `make help` for the full list.

### Docker

```bash
docker build -t csd-bg-scraper:latest .

docker run --rm \
  -v "$(pwd)/data:/data" \
  --env-file .env \
  csd-bg-scraper:latest \
  scrape,download,extract \
  --csv /data/free_float.csv \
  --db /data/free_float.db \
  --log /data/app.log
```

The image uses **Node 22** and entrypoint `node packages/cli/dist/index.js`.

### Docker Compose / Synology

```bash
mkdir -p data
cp .env.example .env   # set CSD_BG_STATISTICS_URL and DATA_HOST_PATH

docker compose run --rm csd-bg-scraper scrape,download,extract
```

Compose mounts `${DATA_HOST_PATH:-./data}` → `/data` and passes pipeline args in `docker-compose.yml`. Adjust `command`, memory limits, and `DOCKER_USER` there for production.

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
| `csd-bg.logLevel` | Minimum log level for output and `app.log` (default `INFO`) |

## Pipeline workflow

Default production command:

```bash
docker compose run --rm csd-bg-scraper scrape,download,extract
```

### Step: `scrape`

1. Load statistics page (`CSD_BG_STATISTICS_URL`)
2. POST paginate through JSF form `formFF` until empty pages or `--max-pages`
3. For each link: skip if date exists; optionally **early-stop** after N consecutive duplicates
4. Insert new rows into `free_float` and append CSV (`date,url`)

### Step: `download`

1. Optionally clear failed marks (`--clear-failed-downloads`)
2. For each `free_float` row without `pdf_content`: GET PDF with retries + backoff
3. Store BLOB or mark `status=failed`

### Step: `extract`

1. Optionally clear failed extract marks (`--clear-failed-extracts`)
2. Parse pending downloaded PDFs (pdfjs-dist + regex, validated against fixtures)
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
├── tests/fixtures/           # Offline HTML/PDF golden files (shared)
├── data/                     # Local CSV/DB output (gitignored)
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
  csvPath: "./data/free_float.csv",
  dbPath: "./data/free_float.db",
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

### Synology DSM

1. Copy repo or `make assembly` → `build/csd-bg-synology.zip`
2. Unzip on NAS, configure `.env` (`CSD_BG_STATISTICS_URL`, `DATA_HOST_PATH`, `DOCKER_USER`)
3. Schedule: `docker compose run --rm csd-bg-scraper scrape,download,extract`

### AWS / other

Same Docker image — push to ECR/ACR and run as a scheduled task (EventBridge, cron, etc.) with a persistent volume for `/data`.

## Configuration

### Environment variables

| Variable | Role |
|----------|------|
| `CSD_BG_STATISTICS_URL` | Full member statistics page URL (**required for scrape**) |
| `DATA_HOST_PATH` | Host path mounted to `/data` in compose |
| `DOCKER_USER` | Container `UID:GID` (Synology) |
| `CSV_PATH` / `DB_PATH` | Documented production paths (often `/data/...`) |
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
| content            | BLOB      | PDF bytes                            |
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

## CSV format

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
