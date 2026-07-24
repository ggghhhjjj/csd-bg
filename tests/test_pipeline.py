"""Tests for pipeline step parsing and execution."""

import pytest

from src.pipeline import parse_steps, run_pipeline, PipelineError, KNOWN_STEPS


class TestParseSteps:
    """Test suite for parse_steps."""

    def test_parse_scrape_download_extract(self):
        assert parse_steps("scrape,download,extract") == [
            "scrape",
            "download",
            "extract",
        ]

    def test_parse_single_step(self):
        assert parse_steps("download") == ["download"]
        assert parse_steps("scrape") == ["scrape"]
        assert parse_steps("extract") == ["extract"]

    def test_parse_trims_whitespace(self):
        assert parse_steps(" scrape , download ") == ["scrape", "download"]

    def test_parse_preserves_order(self):
        assert parse_steps("download,scrape") == ["download", "scrape"]

    def test_unknown_step_raises(self):
        with pytest.raises(PipelineError) as excinfo:
            parse_steps("scrape,transform")
        assert "Unknown step" in str(excinfo.value)
        assert "transform" in str(excinfo.value)

    def test_empty_raises(self):
        with pytest.raises(PipelineError):
            parse_steps("")
        with pytest.raises(PipelineError):
            parse_steps("   ")
        with pytest.raises(PipelineError):
            parse_steps(",,")

    def test_duplicate_steps_raise(self):
        with pytest.raises(PipelineError) as excinfo:
            parse_steps("scrape,scrape")
        assert "Duplicate" in str(excinfo.value)

    def test_known_steps_constant(self):
        assert KNOWN_STEPS == ("scrape", "download", "extract")


class TestRunPipeline:
    """Test suite for run_pipeline."""

    def test_runs_handlers_in_order(self):
        calls = []

        def scrape():
            calls.append("scrape")
            return 0

        def download():
            calls.append("download")
            return 0

        def extract():
            calls.append("extract")
            return 0

        code = run_pipeline(
            ["scrape", "download", "extract"],
            {"scrape": scrape, "download": download, "extract": extract},
        )
        assert code == 0
        assert calls == ["scrape", "download", "extract"]

    def test_stops_on_nonzero(self):
        calls = []

        def scrape():
            calls.append("scrape")
            return 1

        def download():
            calls.append("download")
            return 0

        code = run_pipeline(
            ["scrape", "download"],
            {"scrape": scrape, "download": download},
        )
        assert code == 1
        assert calls == ["scrape"]

    def test_missing_handler_raises(self):
        with pytest.raises(PipelineError) as excinfo:
            run_pipeline(["scrape"], {})
        assert "No handler" in str(excinfo.value)
