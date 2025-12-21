"""Tests for the main application."""

import pytest
from unittest.mock import Mock, patch, MagicMock
from pathlib import Path
import tempfile
import shutil

from app import FreeFloatScraperApp, parse_arguments, main


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
        
        # Verify context manager was used
        mock_db_instance.__enter__.assert_called_once()
        mock_csv_instance.initialize_file.assert_called_once()

    def test_process_links_new_records(self, app):
        """Test process_links with new records."""
        links = [
            {'date': '2025-12-04', 'url': 'https://example.com/test1.pdf'},
            {'date': '2025-12-03', 'url': 'https://example.com/test2.pdf'}
        ]
        
        app.db_manager.record_exists = Mock(return_value=False)
        app.db_manager.insert_record = Mock(return_value=True)
        app.csv_manager.append_record = Mock()
        app.db_manager.connect = Mock()
        app.db_manager.disconnect = Mock()
        
        app.process_links(links)
        
        assert app.new_records_count == 2
        assert app.skipped_records_count == 0
        assert app.csv_manager.append_record.call_count == 2

    def test_process_links_existing_records(self, app):
        """Test process_links with existing records."""
        links = [
            {'date': '2025-12-04', 'url': 'https://example.com/test1.pdf'}
        ]
        
        app.db_manager.record_exists = Mock(return_value=True)
        app.db_manager.connect = Mock()
        app.db_manager.disconnect = Mock()
        
        app.process_links(links)
        
        assert app.new_records_count == 0
        assert app.skipped_records_count == 1

    def test_process_links_mixed_records(self, app):
        """Test process_links with mix of new and existing records."""
        links = [
            {'date': '2025-12-04', 'url': 'https://example.com/test1.pdf'},
            {'date': '2025-12-03', 'url': 'https://example.com/test2.pdf'},
            {'date': '2025-12-02', 'url': 'https://example.com/test3.pdf'}
        ]
        
        # First exists, second is new, third is new
        app.db_manager.record_exists = Mock(side_effect=[True, False, False])
        app.db_manager.insert_record = Mock(return_value=True)
        app.csv_manager.append_record = Mock()
        app.db_manager.connect = Mock()
        app.db_manager.disconnect = Mock()
        
        app.process_links(links)
        
        assert app.new_records_count == 2
        assert app.skipped_records_count == 1
        assert app.csv_manager.append_record.call_count == 2

    @patch.object(FreeFloatScraperApp, 'process_links')
    @patch.object(FreeFloatScraperApp, 'setup')
    def test_run_success(self, mock_setup, mock_process, app):
        """Test successful run."""
        mock_links = [
            {'date': '2025-12-04', 'url': 'https://example.com/test1.pdf'}
        ]
        # With default settings, uses pagination
        app.scraper.scrape_with_post_pagination = Mock(return_value=mock_links)
        app.new_records_count = 1
        app.skipped_records_count = 0
        
        exit_code = app.run()
        
        assert exit_code == 0
        mock_setup.assert_called_once()
        app.scraper.scrape_with_post_pagination.assert_called_once()
        mock_process.assert_called_once_with(mock_links)

    @patch.object(FreeFloatScraperApp, 'setup')
    def test_run_no_links_found(self, mock_setup, app):
        """Test run when no links are found."""
        # With default settings, uses pagination
        app.scraper.scrape_with_post_pagination = Mock(return_value=[])
        
        exit_code = app.run()
        
        assert exit_code == 0
        mock_setup.assert_called_once()

    @patch.object(FreeFloatScraperApp, 'setup')
    def test_run_scraper_error(self, mock_setup, app):
        """Test run handles scraper errors."""
        from src.web_scraper import WebScraperError
        app.scraper.scrape = Mock(side_effect=WebScraperError("Network error"))
        
        exit_code = app.run()
        
        assert exit_code == 1


class TestParseArguments:
    """Test suite for argument parsing."""

    def test_parse_arguments_required(self, monkeypatch):
        """Test parsing with required arguments."""
        monkeypatch.setattr('sys.argv', [
            'app.py',
            '--csv', '/data/test.csv',
            '--db', '/data/test.db'
        ])
        
        args = parse_arguments()
        
        assert args.csv == '/data/test.csv'
        assert args.db == '/data/test.db'
        assert args.timeout == 30

    def test_parse_arguments_with_timeout(self, monkeypatch):
        """Test parsing with custom timeout."""
        monkeypatch.setattr('sys.argv', [
            'app.py',
            '--csv', '/data/test.csv',
            '--db', '/data/test.db',
            '--timeout', '60'
        ])
        
        args = parse_arguments()
        
        assert args.timeout == 60

    def test_parse_arguments_missing_csv(self, monkeypatch):
        """Test parsing fails when --csv is missing."""
        monkeypatch.setattr('sys.argv', [
            'app.py',
            '--db', '/data/test.db'
        ])
        
        with pytest.raises(SystemExit):
            parse_arguments()

    def test_parse_arguments_missing_db(self, monkeypatch):
        """Test parsing fails when --db is missing."""
        monkeypatch.setattr('sys.argv', [
            'app.py',
            '--csv', '/data/test.csv'
        ])
        
        with pytest.raises(SystemExit):
            parse_arguments()

    def test_parse_arguments_default_flags(self, monkeypatch):
        """Test that default flags are False (negated)."""
        monkeypatch.setattr('sys.argv', [
            'app.py',
            '--csv', '/data/test.csv',
            '--db', '/data/test.db'
        ])
        
        args = parse_arguments()
        
        # These are now --no-pagination and --no-early-stopping
        # Default values should be False (meaning features are enabled)
        assert args.no_pagination is False
        assert args.no_early_stopping is False

    def test_parse_arguments_disable_pagination(self, monkeypatch):
        """Test --no-pagination flag."""
        monkeypatch.setattr('sys.argv', [
            'app.py',
            '--csv', '/data/test.csv',
            '--db', '/data/test.db',
            '--no-pagination'
        ])
        
        args = parse_arguments()
        
        assert args.no_pagination is True

    def test_parse_arguments_disable_early_stopping(self, monkeypatch):
        """Test --no-early-stopping flag."""
        monkeypatch.setattr('sys.argv', [
            'app.py',
            '--csv', '/data/test.csv',
            '--db', '/data/test.db',
            '--no-early-stopping'
        ])
        
        args = parse_arguments()
        
        assert args.no_early_stopping is True


class TestMain:
    """Test suite for main function."""

    @patch('app.FreeFloatScraperApp')
    def test_main_success(self, mock_app_class, monkeypatch):
        """Test main function success."""
        monkeypatch.setattr('sys.argv', [
            'app.py',
            '--csv', '/data/test.csv',
            '--db', '/data/test.db'
        ])
        
        mock_app_instance = Mock()
        mock_app_instance.run.return_value = 0
        mock_app_class.return_value = mock_app_instance
        
        exit_code = main()
        
        assert exit_code == 0
        mock_app_class.assert_called_once_with(
            csv_path='/data/test.csv',
            db_path='/data/test.db',
            timeout=30,
            use_post_pagination=True,  # Now enabled by default
            max_pages=None,
            enable_early_stopping=True,  # Now enabled by default
            early_stopping_threshold=10
        )
        mock_app_instance.run.assert_called_once()

    @patch('app.FreeFloatScraperApp')
    def test_main_failure(self, mock_app_class, monkeypatch):
        """Test main function failure."""
        monkeypatch.setattr('sys.argv', [
            'app.py',
            '--csv', '/data/test.csv',
            '--db', '/data/test.db'
        ])
        
        mock_app_instance = Mock()
        mock_app_instance.run.return_value = 1
        mock_app_class.return_value = mock_app_instance
        
        exit_code = main()
        
        assert exit_code == 1
