"""Tests for the main application."""

import pytest
from unittest.mock import Mock, patch, MagicMock
from pathlib import Path
import tempfile
import shutil

import logging

from app import FreeFloatScraperApp, parse_arguments, main, configure_file_logging
from src.pdf_downloader import PdfDownloaderError
from src.pdf_extractor import PdfExtractorError


class TestFreeFloatScraperApp:
    """Test suite for FreeFloatScraperApp class."""

    @pytest.fixture
    def temp_dir(self):
        """Create a temporary directory for testing."""
        temp_path = tempfile.mkdtemp()
        yield temp_path
        shutil.rmtree(temp_path, ignore_errors=True)

    @pytest.fixture
    def app(self, temp_dir):
        """Create an app instance for testing."""
        csv_path = str(Path(temp_dir) / "test.csv")
        db_path = str(Path(temp_dir) / "test.db")
        return FreeFloatScraperApp(csv_path, db_path, timeout=10)

    def test_initialization(self, app, temp_dir):
        """Test app initialization."""
        assert app.csv_path == str(Path(temp_dir) / "test.csv")
        assert app.db_path == str(Path(temp_dir) / "test.db")
        assert app.timeout == 10
        assert app.new_records_count == 0
        assert app.skipped_records_count == 0

    def test_setup(self, app):
        """Test setup method."""
        mock_db_instance = MagicMock()
        mock_csv_instance = MagicMock()

        app.db_manager = mock_db_instance
        app.csv_manager = mock_csv_instance

        app.setup()

        mock_db_instance.__enter__.assert_called_once()
        mock_db_instance.initialize_tables.assert_called_once()
        mock_csv_instance.initialize_file.assert_called_once()

    def test_process_links_new_records(self, app):
        """Test process_links with new records."""
        links = [
            {"date": "2025-12-04", "url": "https://example.com/test1.pdf"},
            {"date": "2025-12-03", "url": "https://example.com/test2.pdf"},
        ]

        app.db_manager.record_exists = Mock(return_value=False)
        app.db_manager.insert_record = Mock(side_effect=[1, 2])
        app.csv_manager.append_record = Mock()
        app.db_manager.connect = Mock()
        app.db_manager.disconnect = Mock()

        app.process_links(links)

        assert app.new_records_count == 2
        assert app.skipped_records_count == 0
        assert app.csv_manager.append_record.call_count == 2

    def test_process_links_existing_records(self, app):
        """Test process_links with existing records."""
        links = [{"date": "2025-12-04", "url": "https://example.com/test1.pdf"}]

        app.db_manager.record_exists = Mock(return_value=True)
        app.db_manager.connect = Mock()
        app.db_manager.disconnect = Mock()

        app.process_links(links)

        assert app.new_records_count == 0
        assert app.skipped_records_count == 1

    def test_process_links_mixed_records(self, app):
        """Test process_links with mix of new and existing records."""
        links = [
            {"date": "2025-12-04", "url": "https://example.com/test1.pdf"},
            {"date": "2025-12-03", "url": "https://example.com/test2.pdf"},
            {"date": "2025-12-02", "url": "https://example.com/test3.pdf"},
        ]

        app.db_manager.record_exists = Mock(side_effect=[True, False, False])
        app.db_manager.insert_record = Mock(side_effect=[10, 11])
        app.csv_manager.append_record = Mock()
        app.db_manager.connect = Mock()
        app.db_manager.disconnect = Mock()

        app.process_links(links)

        assert app.new_records_count == 2
        assert app.skipped_records_count == 1
        assert app.csv_manager.append_record.call_count == 2

    @patch.object(FreeFloatScraperApp, "process_links")
    @patch.object(FreeFloatScraperApp, "setup")
    def test_run_success(self, mock_setup, mock_process, app):
        """Test successful scrape via run(steps=['scrape'])."""
        mock_links = [{"date": "2025-12-04", "url": "https://example.com/test1.pdf"}]
        app.scraper.scrape_with_post_pagination = Mock(return_value=mock_links)
        app.new_records_count = 1
        app.skipped_records_count = 0

        exit_code = app.run(steps=["scrape"])

        assert exit_code == 0
        mock_setup.assert_called_once()
        app.scraper.scrape_with_post_pagination.assert_called_once()
        mock_process.assert_called_once_with(mock_links)

    @patch.object(FreeFloatScraperApp, "setup")
    def test_run_no_links_found(self, mock_setup, app):
        """Test run when no links are found."""
        app.scraper.scrape_with_post_pagination = Mock(return_value=[])

        exit_code = app.run(steps=["scrape"])

        assert exit_code == 0
        mock_setup.assert_called_once()

    @patch.object(FreeFloatScraperApp, "setup")
    def test_run_scraper_error(self, mock_setup, app):
        """Test run handles scraper errors."""
        from src.web_scraper import WebScraperError

        app.use_post_pagination = False
        app.scraper.scrape = Mock(side_effect=WebScraperError("Network error"))

        exit_code = app.run(steps=["scrape"])

        assert exit_code == 1

    def test_run_download_success_and_failure(self, app):
        """Download step stores successes and marks failures."""
        pending = [
            {"id": 1, "date": "2025-12-04", "url": "https://example.com/ok.pdf"},
            {"id": 2, "date": "2025-12-03", "url": "https://example.com/bad.pdf"},
        ]

        mock_db = MagicMock()
        mock_db.__enter__.return_value = mock_db
        mock_db.get_pending_pdf_downloads.return_value = pending
        app.db_manager = mock_db
        app.setup = Mock()

        app.pdf_downloader.download = Mock(side_effect=[b"%PDF-ok", PdfDownloaderError("404")])
        app.pdf_downloader.last_attempts = 3

        exit_code = app.run(steps=["download"])

        assert exit_code == 0
        assert app.downloaded_count == 1
        assert app.download_failed_count == 1
        mock_db.upsert_pdf_downloaded.assert_called_once()
        mock_db.mark_pdf_failed.assert_called_once()

    def test_run_download_clears_failed_when_requested(self, temp_dir):
        """--clear-failed-downloads clears marks before pending query."""
        csv_path = str(Path(temp_dir) / "test.csv")
        db_path = str(Path(temp_dir) / "test.db")
        app = FreeFloatScraperApp(csv_path, db_path, timeout=10, clear_failed_downloads=True)

        mock_db = MagicMock()
        mock_db.__enter__.return_value = mock_db
        mock_db.clear_failed_pdf_downloads.return_value = 2
        mock_db.get_pending_pdf_downloads.return_value = []
        app.db_manager = mock_db
        app.setup = Mock()

        exit_code = app.run(steps=["download"])

        assert exit_code == 0
        mock_db.clear_failed_pdf_downloads.assert_called_once_with()

    @patch.object(FreeFloatScraperApp, "run_extract", return_value=0)
    @patch.object(FreeFloatScraperApp, "run_download", return_value=0)
    @patch.object(FreeFloatScraperApp, "run_scrape", return_value=0)
    def test_run_scrape_download_extract_pipeline(
        self, mock_scrape, mock_download, mock_extract, app
    ):
        """scrape,download,extract runs all steps in order."""
        exit_code = app.run(steps=["scrape", "download", "extract"])

        assert exit_code == 0
        mock_scrape.assert_called_once()
        mock_download.assert_called_once()
        mock_extract.assert_called_once()

    def test_run_extract_success_and_failure(self, app):
        """Extract step stores successes and marks failures."""
        pending = [
            {
                "free_float_id": 1,
                "date": "2026-07-23",
                "content": b"%PDF-ok",
            },
            {
                "free_float_id": 2,
                "date": "2026-07-22",
                "content": b"%PDF-bad",
            },
        ]

        mock_db = MagicMock()
        mock_db.__enter__.return_value = mock_db
        mock_db.get_pending_pdf_extractions.return_value = pending
        app.db_manager = mock_db
        app.setup = Mock()
        app.pdf_extractor.extract = Mock(
            side_effect=[[{"isin": "BG1100003166"}], PdfExtractorError("parse fail")]
        )

        exit_code = app.run(steps=["extract"])

        assert exit_code == 0
        assert app.extracted_count == 1
        assert app.extract_failed_count == 1
        mock_db.save_extracted_rows.assert_called_once()
        mock_db.mark_pdf_extracted.assert_called_once()
        mock_db.mark_pdf_extract_failed.assert_called_once()

    def test_run_extract_clears_failed_when_requested(self, temp_dir):
        csv_path = str(Path(temp_dir) / "test.csv")
        db_path = str(Path(temp_dir) / "test.db")
        app = FreeFloatScraperApp(csv_path, db_path, timeout=10, clear_failed_extracts=True)

        mock_db = MagicMock()
        mock_db.__enter__.return_value = mock_db
        mock_db.clear_failed_pdf_extractions.return_value = 1
        mock_db.get_pending_pdf_extractions.return_value = []
        app.db_manager = mock_db
        app.setup = Mock()

        exit_code = app.run(steps=["extract"])

        assert exit_code == 0
        mock_db.clear_failed_pdf_extractions.assert_called_once_with()


class TestConfigureFileLogging:
    """Test suite for file logging setup."""

    def test_configure_file_logging_attaches_handler(self, tmp_path):
        """File handler is attached for the configured path."""
        log_path = tmp_path / "nested" / "app.log"
        configure_file_logging(str(log_path))

        abs_path = str(log_path.resolve())
        file_handlers = [
            h
            for h in logging.getLogger().handlers
            if isinstance(h, logging.FileHandler) and h.baseFilename == abs_path
        ]

        assert log_path.exists()
        assert len(file_handlers) == 1


class TestParseArguments:
    """Test suite for argument parsing."""

    def test_parse_arguments_required(self, monkeypatch):
        """Test parsing with required arguments and default steps."""
        monkeypatch.setattr(
            "sys.argv",
            ["app.py", "--csv", "/data/test.csv", "--db", "/data/test.db"],
        )

        args = parse_arguments()

        assert args.csv == "/data/test.csv"
        assert args.db == "/data/test.db"
        assert args.log == "/data/app.log"
        assert args.timeout == 30
        assert args.parsed_steps == ["scrape", "download", "extract"]

    def test_parse_arguments_custom_log(self, monkeypatch):
        """Test parsing with custom --log path."""
        monkeypatch.setattr(
            "sys.argv",
            [
                "app.py",
                "download",
                "--db",
                "/data/test.db",
                "--log",
                "/data/custom.log",
            ],
        )

        args = parse_arguments()

        assert args.log == "/data/custom.log"

    def test_parse_arguments_with_timeout(self, monkeypatch):
        """Test parsing with custom timeout."""
        monkeypatch.setattr(
            "sys.argv",
            [
                "app.py",
                "scrape",
                "--csv",
                "/data/test.csv",
                "--db",
                "/data/test.db",
                "--timeout",
                "60",
            ],
        )

        args = parse_arguments()

        assert args.timeout == 60
        assert args.parsed_steps == ["scrape"]

    def test_parse_arguments_missing_csv_for_scrape(self, monkeypatch):
        """Test parsing fails when --csv is missing for scrape."""
        monkeypatch.setattr("sys.argv", ["app.py", "scrape", "--db", "/data/test.db"])

        with pytest.raises(SystemExit):
            parse_arguments()

    def test_parse_download_without_csv(self, monkeypatch):
        """Download-only does not require --csv."""
        monkeypatch.setattr("sys.argv", ["app.py", "download", "--db", "/data/test.db"])

        args = parse_arguments()

        assert args.parsed_steps == ["download"]
        assert args.csv is None

    def test_parse_arguments_missing_db(self, monkeypatch):
        """Test parsing fails when --db is missing."""
        monkeypatch.setattr("sys.argv", ["app.py", "scrape", "--csv", "/data/test.csv"])

        with pytest.raises(SystemExit):
            parse_arguments()

    def test_parse_arguments_default_flags(self, monkeypatch):
        """Test that default flags are False (negated)."""
        monkeypatch.setattr(
            "sys.argv",
            ["app.py", "scrape", "--csv", "/data/test.csv", "--db", "/data/test.db"],
        )

        args = parse_arguments()

        assert args.no_pagination is False
        assert args.no_early_stopping is False

    def test_parse_arguments_disable_pagination(self, monkeypatch):
        """Test --no-pagination flag."""
        monkeypatch.setattr(
            "sys.argv",
            [
                "app.py",
                "scrape",
                "--csv",
                "/data/test.csv",
                "--db",
                "/data/test.db",
                "--no-pagination",
            ],
        )

        args = parse_arguments()

        assert args.no_pagination is True

    def test_parse_arguments_disable_early_stopping(self, monkeypatch):
        """Test --no-early-stopping flag."""
        monkeypatch.setattr(
            "sys.argv",
            [
                "app.py",
                "scrape",
                "--csv",
                "/data/test.csv",
                "--db",
                "/data/test.db",
                "--no-early-stopping",
            ],
        )

        args = parse_arguments()

        assert args.no_early_stopping is True

    def test_parse_download_retry_flags(self, monkeypatch):
        """Test download retry / clear-failed flags."""
        monkeypatch.setattr(
            "sys.argv",
            [
                "app.py",
                "download",
                "--db",
                "/data/test.db",
                "--download-retries",
                "5",
                "--download-retry-min",
                "11",
                "--download-retry-max",
                "22",
                "--clear-failed-downloads",
            ],
        )

        args = parse_arguments()

        assert args.download_retries == 5
        assert args.download_retry_min == 11
        assert args.download_retry_max == 22
        assert args.clear_failed_downloads is True


class TestMain:
    """Test suite for main function."""

    @patch("app.configure_file_logging")
    @patch("app.FreeFloatScraperApp")
    def test_main_success(self, mock_app_class, mock_configure_logging, monkeypatch):
        """Test main function success."""
        monkeypatch.setattr(
            "sys.argv",
            [
                "app.py",
                "scrape,download,extract",
                "--csv",
                "/data/test.csv",
                "--db",
                "/data/test.db",
            ],
        )

        mock_app_instance = Mock()
        mock_app_instance.run.return_value = 0
        mock_app_class.return_value = mock_app_instance

        exit_code = main()

        assert exit_code == 0
        mock_configure_logging.assert_called_once_with("/data/app.log")
        mock_app_class.assert_called_once_with(
            csv_path="/data/test.csv",
            db_path="/data/test.db",
            timeout=30,
            use_post_pagination=True,
            max_pages=None,
            enable_early_stopping=True,
            early_stopping_threshold=10,
            download_retries=3,
            download_retry_min=10,
            download_retry_max=30,
            clear_failed_downloads=False,
            clear_failed_extracts=False,
        )
        mock_app_instance.run.assert_called_once_with(steps=["scrape", "download", "extract"])

    @patch("app.configure_file_logging")
    @patch("app.FreeFloatScraperApp")
    def test_main_failure(self, mock_app_class, mock_configure_logging, monkeypatch):
        """Test main function failure."""
        monkeypatch.setattr(
            "sys.argv",
            ["app.py", "scrape", "--csv", "/data/test.csv", "--db", "/data/test.db"],
        )

        mock_app_instance = Mock()
        mock_app_instance.run.return_value = 1
        mock_app_class.return_value = mock_app_instance

        exit_code = main()

        assert exit_code == 1
        mock_configure_logging.assert_called_once_with("/data/app.log")
