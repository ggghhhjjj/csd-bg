"""Application settings loaded from environment variables."""

import os
from urllib.parse import urlparse

CSD_BG_STATISTICS_URL_ENV = "CSD_BG_STATISTICS_URL"


class ScraperConfigError(Exception):
    """Raised when required scraper configuration is missing or invalid."""


def base_url_from_statistics_url(statistics_url: str) -> str:
    """Derive scheme + host used to prefix relative PDF hrefs."""
    parsed = urlparse(statistics_url)
    if not parsed.scheme or not parsed.netloc:
        raise ScraperConfigError(
            f"{CSD_BG_STATISTICS_URL_ENV} must be an absolute URL with scheme and host"
        )
    return f"{parsed.scheme}://{parsed.netloc}"


def resolve_statistics_url(explicit_url: str | None = None) -> str:
    """
    Resolve the member statistics page URL from an explicit value or the environment.

    Args:
        explicit_url: Optional override (used in tests); when None, reads
            CSD_BG_STATISTICS_URL from the environment.

    Raises:
        ScraperConfigError: If the URL is missing or invalid.
    """
    raw = (explicit_url if explicit_url is not None else os.environ.get(CSD_BG_STATISTICS_URL_ENV, "")).strip()
    if not raw:
        raise ScraperConfigError(
            f"{CSD_BG_STATISTICS_URL_ENV} is not set. "
            "Copy .env.example to .env and set the statistics page URL for scraping."
        )
    base_url_from_statistics_url(raw)
    return raw
