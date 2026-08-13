# Quickstart Guide

This guide will help you get started with the CSD-BG Free Float Scraper in under 5 minutes.

## Option 1: Docker Compose (Recommended)

The fastest way to run the application:

```bash
# 1. Ensure Docker is running
docker --version

# 2. Create data directory and configure environment
mkdir -p data
cp .env.example .env
# Edit .env and set CSD_BG_STATISTICS_URL

# 3. Run the application
docker compose run --rm csd-bg-scraper scrape,download,extract

# 4. Check output
ls -l data/
sqlite3 data/free_float.db "SELECT COUNT(*) FROM free_float;"
```

That's it! The application will scrape the website and store records in SQLite. CSV export is **optional** — see [CSV export (verbose mode)](#csv-export-verbose-mode) below.

## Option 2: Local Node.js

If you prefer running locally without Docker:

```bash
# 1. Install dependencies and build
npm install
npm run build

# 2. Configure environment
cp .env.example .env
# Edit .env and set CSD_BG_STATISTICS_URL

# 3. Run the application
node packages/cli/dist/index.js scrape,download,extract \
  --db ./data/free_float.db \
  --log ./data/app.log

# 4. Check output
ls -l data/
sqlite3 data/free_float.db "SELECT COUNT(*) FROM free_float;"
```

## Option 3: Using Makefile

For developers who prefer make commands:

```bash
# Setup and run in one command
make setup run

# Or step by step
make install          # npm install
make build            # compile TypeScript
make init-data-dir    # create data directory
make run              # run full pipeline
```

## Verify Installation

After running, you should see:

1. **data/free_float.db** — SQLite database (always created)
2. **data/app.log** — Application log file (created on first log write; INFO level by default)
3. **data/pdfs/** — Downloaded PDF files (after download step)
4. **data/free_float.csv** — Only when running in verbose mode (see below)

Log verbosity: set `LOG_LEVEL=WARN` in `.env`, or pass `--log-level DEBUG` / `--verbose` on the CLI (CLI wins).

## CSV export (verbose mode)

By default the pipeline does **not** write a CSV file. SQLite is the source of truth.

Enable CSV when you want a human-readable audit log of newly scraped links:

```bash
# CLI shorthand
node packages/cli/dist/index.js scrape --verbose --db ./data/free_float.db

# Or equivalent log level
node packages/cli/dist/index.js scrape --log-level DEBUG --db ./data/free_float.db

# Custom CSV path (verbose only)
node packages/cli/dist/index.js scrape --verbose --csv ./data/custom.csv --db ./data/free_float.db
```

Example CSV content:

```csv
date,url
2025-12-04,https://csd-bg.bg/ffloat/FREE_FLOAT_20251204.pdf
2025-12-03,https://csd-bg.bg/ffloat/FREE_FLOAT_20251203.pdf
```

## Run Tests

Verify everything works correctly:

```bash
make test
# or
npm test
```

## Next Steps

- Read the [README.md](README.md) for detailed documentation
- Check the Deployment section for production setup
- Review Configuration options in `.env.example`

## Troubleshooting

### Issue: Permission denied

```bash
# Fix data directory permissions
sudo chown -R $(whoami):$(whoami) ./data
```

### Issue: Module not found

```bash
# Ensure you're in the correct directory and rebuild
npm install
npm run build
```

### Issue: Docker connection error

```bash
# Check if Docker is running
docker ps

# Restart Docker service
# macOS: Restart Docker Desktop
# Linux: sudo systemctl restart docker
```

## Common Commands

```bash
# Run with custom timeout
node packages/cli/dist/index.js scrape,download,extract \
  --db ./data/test.db \
  --log ./data/app.log \
  --timeout 60

# Verbose run (also writes CSV)
node packages/cli/dist/index.js scrape,download,extract \
  --verbose \
  --db ./data/test.db \
  --log ./data/app.log

# Run in Docker with custom arguments
docker run -v $(pwd)/data:/data csd-bg-scraper:latest --timeout 60

# View Docker logs
docker compose logs -f

# Stop Docker containers
docker compose down

# Clean up
make clean
make clean-data
```

## Support

For issues or questions:
1. Check the [README.md](README.md)
2. Open an issue on GitHub
