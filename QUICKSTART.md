# Quickstart Guide

This guide will help you get started with the CSD-BG Free Float Scraper in under 5 minutes.

## Option 1: Docker Compose (Recommended)

The fastest way to run the application:

```bash
# 1. Ensure Docker is running
docker --version

# 2. Create data directory
mkdir -p data

# 3. Run the application
docker-compose up

# 4. Check output
ls -l data/
cat data/free_float.csv
```

That's it! The application will scrape the website, store records in the database, and export to CSV.

## Option 2: Local Python

If you prefer running locally without Docker:

```bash
# 1. Create virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Run the application
python app.py --csv ./data/free_float.csv --db ./data/free_float.db

# 4. Check output
ls -l data/
cat data/free_float.csv
```

## Option 3: Using Makefile

For developers who prefer make commands:

```bash
# Setup and run in one command
make setup run

# Or step by step
make install          # Install dependencies
make init-data-dir    # Create data directory
make run              # Run application
```

## Verify Installation

After running, you should see:

1. **data/free_float.csv** - CSV file with records
2. **data/free_float.db** - SQLite database
3. **app.log** - Application log file

Example CSV content:
```csv
date,url
2025-12-04,https://csd-bg.bg/ffloat/FREE_FLOAT_20251204.pdf
2025-12-03,https://csd-bg.bg/ffloat/FREE_FLOAT_20251203.pdf
```

## Run Tests

Verify everything works correctly:

```bash
# With make
make test

# Or directly with pytest
pytest tests/ -v
```

## Next Steps

- Read the [README.md](README.md) for detailed documentation
- Check [Deployment](#deployment) section for production setup
- Review [Configuration](#configuration) options
- Explore the [API documentation](docs/) (if available)

## Troubleshooting

### Issue: Permission denied

```bash
# Fix data directory permissions
sudo chown -R $(whoami):$(whoami) ./data
```

### Issue: Module not found

```bash
# Ensure you're in the correct directory
pwd  # Should show: /path/to/csd-bg.bg

# Reinstall dependencies
pip install -r requirements.txt
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
python app.py --csv ./data/test.csv --db ./data/test.db --timeout 60

# Run in Docker with custom arguments
docker run -v $(pwd)/data:/data csd-bg-scraper:latest --timeout 60

# View Docker logs
docker-compose logs -f

# Stop Docker containers
docker-compose down

# Clean up
make clean
make clean-data
```

## Support

For issues or questions:
1. Check the [README.md](README.md)
2. Review [PROJECT REQUIREMENTS.md](PROJECT%20REQUIREMENTS.md)
3. Open an issue on GitHub
