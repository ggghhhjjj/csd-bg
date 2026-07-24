# Use official Python runtime as base image
FROM python:3.11-slim

# Build arguments for user and group (Synology DSC 7.2.2 compatibility)
ARG APP_UID=1031
ARG APP_GID=65538

# Set environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    APP_UID=${APP_UID} \
    APP_GID=${APP_GID}

# Set working directory
WORKDIR /app

# Create non-root user and group (skip if they already exist)
RUN mkdir -p /data && \
    if ! getent group "$APP_GID" > /dev/null 2>&1; then \
        groupadd -r -g "$APP_GID" appuser; \
    fi && \
    if ! getent passwd "$APP_UID" > /dev/null 2>&1; then \
        useradd -r -u "$APP_UID" -g "$APP_GID" appuser; \
    fi && \
    chown -R "$APP_UID":"$APP_GID" /app /data

# Copy requirements first for better caching
COPY --chown=appuser:appuser requirements.txt .

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY --chown=appuser:appuser src/ ./src/
COPY --chown=appuser:appuser app.py .

# Switch to non-root user
USER appuser

# Create volume mount point
VOLUME ["/data"]

# Set default command
ENTRYPOINT ["python", "app.py"]

# Default pipeline steps + arguments (can be overridden)
CMD ["scrape,download,extract", "--csv", "/data/free_float.csv", "--db", "/data/free_float.db"]
