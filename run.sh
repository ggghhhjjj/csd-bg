#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

DATA_DIR="${DATA_DIR:-./data}"
CLI_ENTRY="packages/cli/dist/index.js"

print_usage() {
  cat <<EOF
CSD-BG Free Float Scraper
=========================

Scrapes Free Float PDF links from the CSD-BG website (csd-bg.bg), stores
metadata in SQLite and CSV, downloads PDF bytes, and extracts issuer metrics
into structured database tables.

This script sets up the app when needed (npm install + build), then runs the
default pipeline: scrape → download → extract.

Quick start
-----------
  ./run.sh                          Run full pipeline (setup first if needed)
  ./run.sh --help                   Show this introduction
  ./run.sh --max-pages 20           Run with extra CLI options (see below)

Data files (default: ./data/)
  free_float.csv   Scraped date + PDF URL rows (append-only)
  free_float.db    SQLite database (metadata, PDF blobs, extracted metrics)
  app.log          Application log file

Configuration
-------------
  Copy .env.example to .env and set CSD_BG_STATISTICS_URL (required for scrape).
  Optional env vars: LOG_LEVEL, CSV_PATH, DB_PATH, TZ (see .env.example).

Pipeline steps
--------------
  scrape     Fetch PDF links from CSD-BG (POST pagination, early stopping)
  download   Download PDF bytes into the database
  extract    Parse PDFs into stock_issue / issuer / stock_issue_daily tables

  run.sh always runs all three steps. To run individual steps, use the CLI
  directly after setup:

    node packages/cli/dist/index.js scrape --csv ./data/free_float.csv --db ./data/free_float.db
    node packages/cli/dist/index.js download --db ./data/free_float.db
    node packages/cli/dist/index.js extract --db ./data/free_float.db

CLI options (pass after ./run.sh)
---------------------------------
  --log-level <level>             ERROR, WARN, INFO, DEBUG (default: INFO)
  --timeout <seconds>             HTTP timeout (default: 30)
  --no-pagination                 Scrape first page only
  --max-pages <n>                 Limit pagination pages
  --no-early-stopping             Keep paginating even when dates repeat
  --early-stopping-threshold <n>  Consecutive duplicates before stop (default: 10)
  --download-retries <n>          PDF download attempts (default: 3)
  --download-retry-min <seconds>  Min backoff between retries (default: 10)
  --download-retry-max <seconds>  Max backoff between retries (default: 30)
  --clear-failed-downloads        Retry URLs previously marked as failed
  --clear-failed-extracts         Retry PDFs previously marked as failed extract

Examples
--------
  ./run.sh
  ./run.sh --log-level DEBUG
  ./run.sh --max-pages 5 --early-stopping-threshold 3
  ./run.sh --no-pagination
  ./run.sh --clear-failed-downloads --clear-failed-extracts

Other commands
--------------
  make setup          Install dependencies and build manually
  make run            Same pipeline via Make; defaults to --max-pages 5 and early stopping (override: MAX_PAGES=N)
  make test           Run the test suite
  node packages/cli/dist/index.js --help   Full CLI reference

EOF
}

print_header() {
  cat <<EOF
========================================
 CSD-BG Free Float Scraper
 Running scrape → download → extract
 Run './run.sh --help' for usage and options
========================================

EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" || "${1:-}" == "help" ]]; then
  print_usage
  exit 0
fi

if [[ $# -eq 0 ]]; then
  print_header
fi

need_setup=false

if ! command -v node >/dev/null 2>&1; then
  echo "error: Node.js is required (>= 20). Install from https://nodejs.org/" >&2
  exit 1
fi

node_major="$(node -p "process.versions.node.split('.')[0]")"
if (( node_major < 20 )); then
  echo "error: Node.js 20+ is required (found $(node -v))" >&2
  exit 1
fi

if [[ ! -d node_modules ]]; then
  need_setup=true
fi

if [[ ! -f "$CLI_ENTRY" ]]; then
  need_setup=true
fi

if [[ "$need_setup" == true ]]; then
  echo "Setting up csd-bg (dependencies + build)..."
  npm install
  npm run build
else
  echo "Setup already complete; skipping install and build."
fi

mkdir -p "$DATA_DIR"

if [[ ! -f .env ]]; then
  if [[ -f .env.example ]]; then
    cp .env.example .env
    echo "Created .env from .env.example — set CSD_BG_STATISTICS_URL before scraping."
  else
    echo "warning: no .env file found; scrape may fail without CSD_BG_STATISTICS_URL." >&2
  fi
fi

if [[ $# -gt 0 ]]; then
  echo "Running scrape,download,extract pipeline..."
fi

exec node "$CLI_ENTRY" scrape,download,extract \
  --csv "$DATA_DIR/free_float.csv" \
  --db "$DATA_DIR/free_float.db" \
  --log "$DATA_DIR/app.log" \
  "$@"
