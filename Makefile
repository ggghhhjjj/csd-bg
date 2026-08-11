.PHONY: help install install-dev test test-coverage lint format typecheck security clean run docker-build docker-run docker-compose-up docker-compose-down assembly

# Default target
.DEFAULT_GOAL := help

# Variables
PYTHON := python3
PIP := pip
PYTEST := pytest
BLACK := black
FLAKE8 := flake8
MYPY := mypy
BANDIT := bandit
DOCKER := docker
DOCKER_COMPOSE := docker-compose

# Paths
SRC_DIR := src
TEST_DIR := tests
APP_FILE := app.py
DOCKER_IMAGE := csd-bg-scraper
DATA_DIR := ./data

help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Available targets:'
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

install: ## Install production dependencies
	$(PIP) install -r requirements.txt

install-dev: ## Install all dependencies including development tools
	$(PIP) install -r requirements.txt

test: ## Run Node tests (Vitest)
	npm test

test-python: ## Run Python tests
	$(PYTEST) $(TEST_DIR) -v

node-build: ## Build Node monorepo packages
	npm run build

node-install: ## Install Node workspace dependencies
	npm install

test-coverage: ## Run tests with coverage report
	$(PYTEST) $(TEST_DIR) --cov=$(SRC_DIR) --cov=$(APP_FILE) --cov-report=html --cov-report=term-missing -v

test-watch: ## Run tests in watch mode
	$(PYTEST) $(TEST_DIR) -v --looponfail

lint: ## Lint code with flake8
	$(FLAKE8) $(SRC_DIR) $(TEST_DIR) $(APP_FILE) --max-line-length=100 --exclude=venv,__pycache__

format: ## Format code with black
	$(BLACK) $(SRC_DIR) $(TEST_DIR) $(APP_FILE)

format-check: ## Check code formatting without making changes
	$(BLACK) $(SRC_DIR) $(TEST_DIR) $(APP_FILE) --check

typecheck: ## Type check with mypy
	$(MYPY) $(SRC_DIR) $(APP_FILE) --ignore-missing-imports

security: ## Run security checks with bandit
	$(BANDIT) -r $(SRC_DIR) $(APP_FILE) -ll

quality: lint typecheck security ## Run all quality checks

clean: ## Clean up generated files
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name "*.egg-info" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name ".pytest_cache" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name ".mypy_cache" -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete
	find . -type f -name "*.pyo" -delete
	find . -type f -name "*.log" -delete
	rm -rf htmlcov .coverage build dist *.egg-info

clean-data: ## Clean up data files (CSV and DB)
	rm -rf $(DATA_DIR)/*.csv $(DATA_DIR)/*.db

run: ## Run scrape+download+extract pipeline locally (Node CLI)
	@mkdir -p $(DATA_DIR)
	npm run build -w @csd-bg/cli --if-present
	node packages/cli/dist/index.js scrape,download,extract --csv $(DATA_DIR)/free_float.csv --db $(DATA_DIR)/free_float.db --log $(DATA_DIR)/app.log

run-python: ## Run pipeline using legacy Python app.py
	@mkdir -p $(DATA_DIR)
	$(PYTHON) $(APP_FILE) scrape,download,extract --csv $(DATA_DIR)/free_float.csv --db $(DATA_DIR)/free_float.db --log $(DATA_DIR)/app.log

run-timeout: ## Run scrape+download+extract with custom timeout
	@mkdir -p $(DATA_DIR)
	node packages/cli/dist/index.js scrape,download,extract --csv $(DATA_DIR)/free_float.csv --db $(DATA_DIR)/free_float.db --log $(DATA_DIR)/app.log --timeout 60

docker-build: ## Build Docker image
	$(DOCKER) build -t $(DOCKER_IMAGE):latest .

docker-run: ## Run Docker container
	@mkdir -p $(DATA_DIR)
	$(DOCKER) run -v $(PWD)/$(DATA_DIR):/data $(DOCKER_IMAGE):latest

docker-run-interactive: ## Run Docker container interactively
	@mkdir -p $(DATA_DIR)
	$(DOCKER) run -it -v $(PWD)/$(DATA_DIR):/data $(DOCKER_IMAGE):latest /bin/bash

docker-compose-up: ## Start services with docker-compose
	@mkdir -p $(DATA_DIR)
	$(DOCKER_COMPOSE) up

docker-compose-up-detached: ## Start services in detached mode
	@mkdir -p $(DATA_DIR)
	$(DOCKER_COMPOSE) up -d

docker-compose-down: ## Stop services
	$(DOCKER_COMPOSE) down

docker-compose-logs: ## View docker-compose logs
	$(DOCKER_COMPOSE) logs -f

docker-clean: ## Remove Docker image
	$(DOCKER) rmi $(DOCKER_IMAGE):latest || true

all-checks: format-check lint typecheck security test ## Run all checks (format, lint, type, security, test)

setup: node-install node-build ## Initial setup (Node.js)
	@mkdir -p $(DATA_DIR)
	@echo "Setup complete! Run 'make run' to start the Node CLI."

dev-setup: node-install node-build ## Setup Node development environment
	@mkdir -p $(DATA_DIR)
	@echo "Node development environment ready!"

ci: format-check lint typecheck security test-coverage ## Run CI pipeline checks

deploy-build: clean docker-build ## Build for deployment
	@echo "Docker image built successfully!"

init-data-dir: ## Initialize data directory
	@mkdir -p $(DATA_DIR)
	@echo "Data directory created at $(DATA_DIR)"

assembly: ## Create zip file for Synology deployment (Node.js)
	@echo "Creating deployment package for Synology..."
	@mkdir -p build
	@zip -r build/csd-bg-synology.zip \
		.env.example \
		package.json \
		package-lock.json \
		tsconfig.base.json \
		packages/core/package.json \
		packages/core/src \
		packages/cli/package.json \
		packages/cli/src \
		docker-compose.yml \
		Dockerfile \
		.dockerignore
	@echo "✓ Deployment package created: build/csd-bg-synology.zip"
	@echo "Next steps:"
	@echo "  1. Transfer the zip file to your Synology NAS"
	@echo "  2. Unzip it in your desired directory"
	@echo "  3. Configure .env file based on .env.example"
	@echo "  4. Deploy using Synology Container Manager"

