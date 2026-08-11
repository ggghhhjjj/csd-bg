"""Shared pytest configuration."""

import os

import pytest

# Placeholder host for unit tests (production URL lives in .env only).
TEST_STATISTICS_URL = "https://example.test/members/memberStatistics.xhtml"
TEST_BASE_URL = "https://example.test"


@pytest.fixture(autouse=True)
def _csd_bg_statistics_url_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """Ensure scraper tests and app scrape paths have a statistics URL configured."""
    monkeypatch.setenv("CSD_BG_STATISTICS_URL", TEST_STATISTICS_URL)
