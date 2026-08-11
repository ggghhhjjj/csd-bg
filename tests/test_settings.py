"""Tests for scraper settings."""

import pytest

from src.settings import (
    CSD_BG_STATISTICS_URL_ENV,
    ScraperConfigError,
    base_url_from_statistics_url,
    resolve_statistics_url,
)


class TestScraperSettings:
    def test_base_url_from_statistics_url(self):
        url = "https://example.test/members/memberStatistics.xhtml"
        assert base_url_from_statistics_url(url) == "https://example.test"

    def test_resolve_statistics_url_explicit(self):
        assert resolve_statistics_url("https://host.test/page.xhtml") == "https://host.test/page.xhtml"

    def test_resolve_statistics_url_missing_env(self, monkeypatch):
        monkeypatch.delenv(CSD_BG_STATISTICS_URL_ENV, raising=False)
        with pytest.raises(ScraperConfigError) as excinfo:
            resolve_statistics_url()
        assert CSD_BG_STATISTICS_URL_ENV in str(excinfo.value)

    def test_resolve_statistics_url_invalid(self):
        with pytest.raises(ScraperConfigError):
            resolve_statistics_url("/not-absolute")
