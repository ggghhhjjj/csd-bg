# PROJECT REQUIREMENTS

## Overview
This document outlines the requirements and best practices for developing, testing, and deploying a Python 3+ application using Docker. The project will follow Object-Oriented Programming (OOP) principles and Test-Driven Development (TDD) methodology.

---

## 1. Python Application Requirements

- **Python Version**: Python 3.8 or higher.
- **OOP Design**: All core logic should be implemented using OOP principles (classes, encapsulation, inheritance, polymorphism).
- **Code Quality**:
  - Follow PEP 8 style guide.
  - Use type hints and docstrings.
  - Maintain modular and reusable code.
- **Dependency Management**:
  - Use `requirements.txt` or `pyproject.toml` for dependencies.
  - Pin dependency versions to ensure reproducibility.
- **Configuration**:
  - Use environment variables for configuration (never hard-code secrets or credentials).
  - Support `.env` files for local development.

---

## 2. Docker Requirements

- **Dockerfile**:
  - Use official Python base images (e.g., `python:3.11-slim`).
  - Set a working directory (`WORKDIR`).
  - Copy only necessary files to reduce image size.
  - Install dependencies in a separate layer.
  - Use non-root user for running the application.
  - Set entrypoint and/or command for container startup.
- **.dockerignore**:
  - Exclude files and directories not needed in the image (e.g., `.git`, `__pycache__`, `tests`, local configs).
- **Multi-stage Builds** (optional):
  - Use for production images to reduce size and improve security.

---

## 3. Testing Requirements

- **Test-Driven Development (TDD)**:
  - Write tests before implementing features.
  - Use `pytest` or `unittest` for test suites.
  - Place tests in a dedicated `tests/` directory.
  - Achieve high code coverage (aim for 90%+).
- **Continuous Integration (CI)**:
  - Use GitHub Actions, GitLab CI, or similar to run tests on every commit.
  - Lint code and check formatting in CI pipeline.

---

## 4. Development Workflow

1. **Clone the repository**
2. **Create a virtual environment** (for local development):
   ```sh
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```
3. **Run tests locally**:
   ```sh
   pytest
   ```
4. **Build and run with Docker**:
   ```sh
   docker build -t my-python-app .
   docker run --env-file .env my-python-app
   ```

---

## 5. Documentation

- Maintain clear and up-to-date documentation for setup, usage, and development.
- Document all public classes and methods.

---

## 6. Security & Maintenance

- Regularly update dependencies to patch vulnerabilities.
- Use tools like `bandit` for static security analysis.
- Avoid running as root inside containers.
- Scan Docker images for vulnerabilities (e.g., with `trivy`).

---

## 7. Optional Enhancements

- Use `docker-compose` for multi-container setups.
- Add Makefile for common development tasks.
- Use pre-commit hooks for linting and formatting.

---

## References
- [PEP 8 – Style Guide for Python Code](https://peps.python.org/pep-0008/)
- [Docker Best Practices](https://docs.docker.com/develop/dev-best-practices/)
- [Pytest Documentation](https://docs.pytest.org/)
- [12 Factor App Methodology](https://12factor.net/)


---

# Project Assignment

The application must implement the following workflow:

1. **Load Web Page**
  - Fetch the web page from: `https://csd-bg.bg/members/memberStatistics.xhtml`

2. **Extract Relevant Anchors**
  - Parse the HTML and extract all `<a>` tags where the `href` attribute contains `/ffloat/FREE_FLOAT`.
  - Example anchor:
    ```html
    <a class="center-panel-right-13" href="/ffloat/FREE_FLOAT_20251204.pdf" target="_blank">Free Float за 2025-12-04</a>
    ```
3. **For each Anchor**

4. **Extract Href Attribute**
  - For each matching anchor, extract only the value of the `href` attribute.
  - Example:
    ```
    /ffloat/FREE_FLOAT_20251204.pdf
    ```

5. **Generate Full URL**
  - Prefix the extracted `href` value with `https://csd-bg.bg/` to form the full URL.
  - Example:
    ```
    https://csd-bg.bg/ffloat/FREE_FLOAT_20251204.pdf
    ```

6. **Extract Date Suffix**
  - Extract the numeric suffix just before the `.pdf` extension from the `href` value. This represents the date of the PDF document.
  - Example:
    ```
    20251204
    ```

7. **Convert to Date Format**
  - Convert the extracted date string to the format `YYYY-MM-DD`.
  - Example:
    ```
    2025-12-04
    ```

8. **Check in Embedded SQLite Database**
  - Check if a record with this date already exists in the embedded SQLite database.
  - If a record exists, stop processing for this date.
  - If no record exists, insert a new record with the date and the generated URL.
  - Example record:
    | DATE       | URL                                              |
    |------------|--------------------------------------------------|
    | 2025-12-04 | https://csd-bg.bg/ffloat/FREE_FLOAT_20251204.pdf |

9. **Append to CSV File**
  - Append the same record (date and URL) to a CSV file.

10. **Command Line Arguments**
    - The application must accept the path to the CSV file and the path to the embedded SQLite database as command line arguments.
    - Example usage:
      ```sh
      python app.py --csv /data/free_float.csv --db /data/free_float.db
      ```

11. **Docker Compose Support**
    - Provide a `docker-compose.yml` file to run the application in a Docker container.
    - The container must write the CSV file and SQLite database to a specified filesystem path, which should be mounted as a Docker volume.
    - Example volume mapping:
      ```yaml
      volumes:
        - ./data:/data
      ```

12. **Deployment Environments**
    - **Pre-production**: The default pre-production runtime environment is Synology DSM 7.2.2, deployed via the Container Manager application.
    - **Production**: The production environment will be AWS.
    - Ensure the application and Docker setup are compatible with both environments.
