.PHONY: help install test test-coverage lint format clean teardown teardown-all run run-timeout docker-build docker-run docker-compose-up docker-compose-down assembly setup dev-setup ci all-checks

.DEFAULT_GOAL := help

DOCKER := docker
DOCKER_COMPOSE := docker-compose
DOCKER_IMAGE := csd-bg-scraper
DATA_DIR := ./data

help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Available targets:'
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

install: ## Install Node workspace dependencies
	npm install

build: ## Build Node monorepo packages
	npm run build

test: ## Run Node tests (Vitest)
	npm test

test-coverage: ## Run tests with coverage report
	npm run test:coverage

lint: ## Typecheck via TypeScript build
	npm run lint

format: ## Alias for build (TypeScript formatting enforced by compiler)
	npm run build

format-check: ## Verify packages compile without changes
	npm run build

quality: lint test ## Run quality checks (build + test)

all-checks: quality ## Run all checks

ci: quality test-coverage ## Run CI pipeline checks locally

clean: ## Clean up generated files
	find . -type d -name "dist" -path "*/packages/*" -exec rm -rf {} + 2>/dev/null || true
	rm -rf coverage htmlcov .coverage build *.log
	find . -type f -name "*.log" -delete

teardown: clean ## Remove Node setup (node_modules and build artifacts; opposite of setup)
	rm -rf node_modules
	rm -rf packages/*/node_modules
	rm -rf .venv
	@echo "Teardown complete. Run 'make setup' to reinstall."

teardown-all: teardown clean-data ## Full teardown including runtime CSV/DB in ./data
	@echo "Full teardown complete (dependencies, build outputs, and data files removed)."

clean-data: ## Clean up data files (CSV and DB)
	rm -rf $(DATA_DIR)/*.csv $(DATA_DIR)/*.db

run: build ## Run scrape+download+extract pipeline locally (Node CLI)
	@mkdir -p $(DATA_DIR)
	node packages/cli/dist/index.js scrape,download,extract --csv $(DATA_DIR)/free_float.csv --db $(DATA_DIR)/free_float.db --log $(DATA_DIR)/app.log

run-timeout: build ## Run scrape+download+extract with custom timeout
	@mkdir -p $(DATA_DIR)
	node packages/cli/dist/index.js scrape,download,extract --csv $(DATA_DIR)/free_float.csv --db $(DATA_DIR)/free_float.db --log $(DATA_DIR)/app.log --timeout 60

docker-build: ## Build Docker image
	$(DOCKER) build -t $(DOCKER_IMAGE):latest .

docker-run: ## Run Docker container
	@mkdir -p $(DATA_DIR)
	$(DOCKER) run -v $(PWD)/$(DATA_DIR):/data $(DOCKER_IMAGE):latest

docker-run-interactive: ## Run Docker container interactively
	@mkdir -p $(DATA_DIR)
	$(DOCKER) run -it -v $(PWD)/$(DATA_DIR):/data $(DOCKER_IMAGE):latest /bin/sh

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

setup: install build ## Initial setup (Node.js)
	@mkdir -p $(DATA_DIR)
	@echo "Setup complete! Run 'make run' to start the Node CLI."

dev-setup: install build ## Setup Node development environment
	@mkdir -p $(DATA_DIR)
	@echo "Node development environment ready!"

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
	@echo "Deployment package created: build/csd-bg-synology.zip"
