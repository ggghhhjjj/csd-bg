# CSD-BG Free Float Scraper

[![Python 3.11+](https://img.shields.io/badge/python-3.11+-blue.svg)](https://www.python.org/downloads/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Code style: black](https://img.shields.io/badge/code%20style-black-000000.svg)](https://github.com/psf/black)

A Python application that scrapes Free Float PDF links from the CSD-BG (Central Securities Depository Bulgaria) website, stores them in an SQLite database, and exports them to CSV format.

## Features

- 🔍 **Web Scraping**: Automatically extracts Free Float PDF links from CSD-BG website
- 📄 **POST-Based Pagination**: Efficiently scrapes all pages using AJAX POST requests (no browser needed!)
- 💾 **Database Storage**: Stores records in SQLite database with duplicate detection
- 📊 **CSV Export**: Exports data to CSV format for easy analysis
- 🐳 **Docker Support**: Fully containerized with Docker and Docker Compose
- ✅ **TDD Approach**: Comprehensive test suite with high code coverage
- 🛡️ **Type Hints**: Full type annotation for better code quality
- 📝 **Logging**: Detailed logging for monitoring and debugging
- ⚡ **High Performance**: 5x faster than Selenium-based pagination

## Table of Contents

- [Requirements](#requirements)
- [Installation](#installation)
- [Usage](#usage)
  - [Local Usage](#local-usage)
  - [Docker Usage](#docker-usage)
  - [Docker Compose Usage](#docker-compose-usage)
- [Project Structure](#project-structure)
- [Development](#development)
- [Testing](#testing)
- [Deployment](#deployment)
- [Configuration](#configuration)
- [Contributing](#contributing)
- [License](#license)

## Requirements

- Python 3.8 or higher
- Docker (optional, for containerized deployment)
- Docker Compose (optional, for orchestrated deployment)

## Installation

### Local Installation

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd csd-bg.bg
   ```

2. **Create a virtual environment**:
   ```bash
   python3 -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

### Docker Installation

No installation required. Just ensure Docker and Docker Compose are installed on your system.

## Usage

### Local Usage

Run the application with command-line arguments:

```bash
# Scrape first page only (default)
python app.py --csv /path/to/output.csv --db /path/to/database.db

# Scrape all pages using POST pagination (recommended!)
python app.py --csv /path/to/output.csv --db /path/to/database.db --pagination

# Scrape limited pages
python app.py --csv /path/to/output.csv --db /path/to/database.db --pagination --max-pages 10
```

**Arguments**:
- `--csv`: Path to the CSV file for exporting data (required)
- `--db`: Path to the SQLite database file (required)
- `--no-pagination`: Disable POST-based pagination (scrape first page only)
- `--max-pages`: Maximum number of pages to scrape when using pagination (optional)
- `--no-early-stopping`: Disable early stopping when duplicates are found
- `--early-stopping-threshold`: Number of consecutive duplicates before stopping (default: 10)
- `--timeout`: HTTP request timeout in seconds (optional, default: 30)

**Examples**:
```bash
# Incremental update (default) - scrapes all pages until duplicates found
# Ideal for daily updates: fast, efficient, stops automatically
python app.py --csv ./data/free_float.csv --db ./data/free_float.db

# Full scrape - all pages, no early stopping (~1000+ links, takes 2-3 minutes)
python app.py --csv ./data/free_float.csv --db ./data/free_float.db --no-early-stopping

# First page only - quick test or manual control
python app.py --csv ./data/free_float.csv --db ./data/free_float.db --no-pagination

# Custom early stopping threshold (stop after 20 consecutive duplicates)
python app.py --csv ./data/free_float.csv --db ./data/free_float.db --early-stopping-threshold 20

# First 5 pages with early stopping
python app.py --csv ./data/free_float.csv --db ./data/free_float.db --max-pages 5
```

### Docker Usage

1. **Build the Docker image**:
   ```bash
   docker build -t csd-bg-scraper .
   ```

2. **Run the container**:
   ```bash
   docker run -v $(pwd)/data:/data csd-bg-scraper
   ```

   With custom arguments:
   ```bash
   docker run -v $(pwd)/data:/data csd-bg-scraper --csv /data/custom.csv --db /data/custom.db
   ```

### Docker Compose Usage

The easiest way to run the application:

1. **Create data directory** (if it doesn't exist):
   ```bash
   mkdir -p data
   ```

2. **Run with Docker Compose**:
   ```bash
   docker-compose up
   ```

   Run in detached mode:
   ```bash
   docker-compose up -d
   ```

3. **View logs**:
   ```bash
   docker-compose logs -f
   ```

4. **Stop the container**:
   ```bash
   docker-compose down
   ```

### Output Files

After running the application, you'll find:
- **CSV file**: `data/free_float.csv` - Contains date and URL columns
- **SQLite database**: `data/free_float.db` - Contains the `free_float` table
- **Log file**: `app.log` - Application logs

## POST-Based Pagination

The scraper now supports efficient POST-based pagination to extract data from all pages without browser automation!

### Why Use Pagination?

- **Single page**: ~10 links (default behavior)
- **All pages**: ~1000+ links (with `--pagination` flag)
- **Performance**: 5x faster than Selenium, 4x less memory

### How It Works

1. Fetches initial page to get session state (ViewState & nonce)
2. Makes AJAX POST requests to navigate pages
3. Parses XML responses containing HTML with links
4. Automatically handles session state updates
5. Stops when no more pages found

### Quick Start

```bash
# Try with 3 pages first
python3 app.py --csv data.csv --db data.db --pagination --max-pages 3

# Then scrape everything
python3 app.py --csv data.csv --db data.db --pagination
```

### Python API

```python
from src.web_scraper import WebScraper

scraper = WebScraper()

# Single page
links = scraper.scrape()  # ~10 links

# All pages
all_links = scraper.scrape_with_post_pagination()  # ~1000+ links

# Limited pages
limited = scraper.scrape_with_post_pagination(max_pages=5)  # ~50 links
```

### Documentation

- 📖 [Complete Pagination Guide](POST_PAGINATION_GUIDE.md) - Full API reference and technical details
- 🧪 [Test Script](test_pagination_live.py) - Live pagination test (3 pages)
- 💡 [Examples](examples_pagination.py) - Usage examples and comparisons

### Performance Comparison

| Method | Time | Memory | Links |
|--------|------|--------|-------|
| Single page | 2s | 20MB | ~10 |
| POST pagination | 2-3min | 50MB | ~1000+ |
| Selenium | 6-10min | 200MB | ~1000+ |

## Project Structure

```
csd-bg.bg/
├── src/
│   ├── __init__.py
│   ├── web_scraper.py      # Web scraping logic
│   ├── database_manager.py # SQLite database operations
│   └── csv_manager.py      # CSV file operations
├── tests/
│   ├── __init__.py
│   ├── test_web_scraper.py
│   ├── test_database_manager.py
│   ├── test_csv_manager.py
│   └── test_app.py
├── app.py                  # Main application entry point
├── requirements.txt        # Python dependencies
├── Dockerfile             # Docker image configuration
├── docker-compose.yml     # Docker Compose configuration
├── .dockerignore         # Docker ignore patterns
├── .gitignore            # Git ignore patterns
├── Makefile              # Common development tasks
├── README.md             # This file
└── PROJECT REQUIREMENTS.md # Project specifications

```

## Development

### Setting Up Development Environment

1. **Install development dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

2. **Install pre-commit hooks** (optional):
   ```bash
   pre-commit install
   ```

### Code Quality

- **Format code with Black**:
  ```bash
  make format
  # or
  black src/ tests/ app.py
  ```

- **Lint with Flake8**:
  ```bash
  make lint
  # or
  flake8 src/ tests/ app.py
  ```

- **Type check with Mypy**:
  ```bash
  make typecheck
  # or
  mypy src/ app.py
  ```

- **Security scan with Bandit**:
  ```bash
  make security
  # or
  bandit -r src/ app.py
  ```

## Testing

The project follows Test-Driven Development (TDD) principles with comprehensive test coverage.

### Run Tests

```bash
# Run all tests
make test
# or
pytest

# Run with coverage
make test-coverage
# or
pytest --cov=src --cov=app --cov-report=html --cov-report=term

# Run specific test file
pytest tests/test_web_scraper.py

# Run specific test
pytest tests/test_web_scraper.py::TestWebScraper::test_initialization
```

### Test Coverage

View coverage report:
```bash
make test-coverage
open htmlcov/index.html  # Open coverage report in browser
```

## Deployment

### Synology DSM 7.2.2 (Pre-production)

1. **Copy files to Synology NAS**

2. **Open Container Manager**

3. **Import docker-compose.yml**:
   - Go to Project tab
   - Click Create
   - Select docker-compose.yml
   - Adjust volume paths if needed
   - Start the project

4. **Monitor logs**:
   - View logs in Container Manager UI

### AWS Production Deployment

#### Option 1: ECS (Elastic Container Service)

1. **Push image to ECR**:
   ```bash
   aws ecr create-repository --repository-name csd-bg-scraper
   docker tag csd-bg-scraper:latest <account-id>.dkr.ecr.<region>.amazonaws.com/csd-bg-scraper:latest
   docker push <account-id>.dkr.ecr.<region>.amazonaws.com/csd-bg-scraper:latest
   ```

2. **Create ECS task definition** with volume mounts to EFS

3. **Set up scheduled task** with EventBridge (CloudWatch Events)

#### Option 2: EC2 with Docker

1. **Launch EC2 instance** with Docker installed

2. **Copy files and run**:
   ```bash
   scp -r * ec2-user@<instance-ip>:~/csd-bg-scraper/
   ssh ec2-user@<instance-ip>
   cd csd-bg-scraper
   docker-compose up -d
   ```

#### Option 3: Lambda with Container Image

1. **Create Lambda function** using container image
2. **Set up EventBridge** for scheduled execution
3. **Mount EFS** for data persistence

## Configuration

### Environment Variables

You can configure the application using environment variables:

```bash
# Optional: Configure timezone
export TZ=Europe/Sofia
```

### Docker Compose Configuration

Edit `docker-compose.yml` to customize:
- Volume mappings
- Resource limits (CPU, memory)
- Restart policies
- Logging configuration

## Workflow

The application performs the following steps:

1. **Fetch Web Page**: Load `https://csd-bg.bg/members/memberStatistics.xhtml`
2. **Extract Links**: Parse HTML and extract all Free Float PDF links
3. **Parse Dates**: Extract date from filename (format: YYYYMMDD)
4. **Check Database**: Verify if record already exists
5. **Insert Record**: Add new record to SQLite database (if not exists)
6. **Export to CSV**: Append record to CSV file
7. **Log Summary**: Display processing statistics

## Database Schema

### Table: `free_float`

| Column     | Type      | Description                      |
|------------|-----------|----------------------------------|
| date       | TEXT      | Date in YYYY-MM-DD format (PK)  |
| url        | TEXT      | Full URL to PDF file            |
| created_at | TIMESTAMP | Record creation timestamp        |

## CSV Format

| Column | Description               |
|--------|---------------------------|
| date   | Date in YYYY-MM-DD format |
| url    | Full URL to PDF file      |

## Troubleshooting

### Common Issues

1. **Permission denied when writing to volume**:
   ```bash
   # Fix ownership of data directory
   sudo chown -R 1000:1000 ./data
   ```

2. **Connection timeout**:
   - Increase timeout: `--timeout 60`
   - Check network connectivity

3. **Import errors**:
   - Ensure you're in the correct directory
   - Check Python path: `echo $PYTHONPATH`

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- CSD-BG (Central Securities Depository Bulgaria) for providing the data
- Python community for excellent libraries

## Contact

For questions or support, please open an issue in the repository.

---

**Note**: This application is designed for educational and data collection purposes. Please ensure you comply with the website's terms of service and robots.txt file.
