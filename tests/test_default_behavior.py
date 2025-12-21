"""Tests for default incremental update behavior."""

import pytest
from unittest.mock import Mock, MagicMock, patch
from pathlib import Path
import tempfile
import shutil

from app import FreeFloatScraperApp


class TestDefaultIncrementalBehavior:
    """Test suite for default incremental update behavior."""

    @pytest.fixture
    def temp_dir(self):
        """Create a temporary directory for testing."""
        temp_path = tempfile.mkdtemp()
        yield temp_path
        shutil.rmtree(temp_path, ignore_errors=True)

    @pytest.fixture
    def app_default(self, temp_dir):
        """Create app with default settings (should enable pagination + early stopping)."""
        csv_path = str(Path(temp_dir) / "test.csv")
        db_path = str(Path(temp_dir) / "test.db")
        # Default initialization - should enable smart defaults
        return FreeFloatScraperApp(csv_path, db_path)

    def test_default_behavior_enables_pagination_and_early_stopping(self, app_default):
        """Test that default behavior enables pagination and early stopping."""
        # Default app should have pagination and early stopping enabled
        assert app_default.use_post_pagination is True, "Pagination should be enabled by default"
        assert app_default.enable_early_stopping is True, "Early stopping should be enabled by default"
        assert app_default.early_stopping_threshold == 10, "Default threshold should be 10"

    @patch.object(FreeFloatScraperApp, 'process_links')
    @patch.object(FreeFloatScraperApp, 'setup')
    def test_default_run_uses_pagination(self, mock_setup, mock_process, app_default):
        """Test that default run uses pagination."""
        mock_links = [
            {'date': '2025-12-04', 'url': 'https://example.com/test1.pdf'},
            {'date': '2025-12-03', 'url': 'https://example.com/test2.pdf'}
        ]
        
        # Mock the pagination method
        app_default.scraper.scrape_with_post_pagination = Mock(return_value=mock_links)
        app_default.new_records_count = 2
        app_default.skipped_records_count = 0
        
        exit_code = app_default.run()
        
        assert exit_code == 0
        mock_setup.assert_called_once()
        # Should call scrape_with_post_pagination, not scrape
        app_default.scraper.scrape_with_post_pagination.assert_called_once()
        mock_process.assert_called_once_with(mock_links)

    def test_default_run_stops_at_duplicates(self, temp_dir):
        """Test that default run stops when hitting consecutive duplicates."""
        csv_path = str(Path(temp_dir) / "test.csv")
        db_path = str(Path(temp_dir) / "test.db")
        app = FreeFloatScraperApp(csv_path, db_path)
        
        # Simulate: 2 new records, then 10 duplicates
        links = [
            {'date': '2025-12-07', 'url': 'https://example.com/new1.pdf'},
            {'date': '2025-12-06', 'url': 'https://example.com/new2.pdf'},
            *[{'date': f'2025-12-{i:02d}', 'url': f'https://example.com/old{i}.pdf'} 
              for i in range(5, 0, -1)]
        ]
        
        app.db_manager.record_exists = Mock(side_effect=[False, False] + [True] * 10)
        app.db_manager.insert_record = Mock(return_value=True)
        app.csv_manager.append_record = Mock()
        app.db_manager.connect = Mock()
        app.db_manager.disconnect = Mock()
        
        app.process_links(links)
        
        # Should process 2 new + 5 existing, but stop at threshold (total depends on data)
        # With default threshold of 10, and only 5 duplicates, all should be processed
        assert app.new_records_count == 2
        assert app.skipped_records_count == 5

    def test_explicit_disable_pagination(self, temp_dir):
        """Test that pagination can be explicitly disabled."""
        csv_path = str(Path(temp_dir) / "test.csv")
        db_path = str(Path(temp_dir) / "test.db")
        app = FreeFloatScraperApp(
            csv_path, 
            db_path, 
            use_post_pagination=False  # Explicitly disable
        )
        
        assert app.use_post_pagination is False

    def test_explicit_disable_early_stopping(self, temp_dir):
        """Test that early stopping can be explicitly disabled."""
        csv_path = str(Path(temp_dir) / "test.csv")
        db_path = str(Path(temp_dir) / "test.db")
        app = FreeFloatScraperApp(
            csv_path, 
            db_path, 
            enable_early_stopping=False  # Explicitly disable
        )
        
        assert app.enable_early_stopping is False

    def test_incremental_update_scenario(self, temp_dir):
        """Test realistic incremental update scenario."""
        csv_path = str(Path(temp_dir) / "test.csv")
        db_path = str(Path(temp_dir) / "test.db")
        app = FreeFloatScraperApp(csv_path, db_path)  # Default settings
        
        # Simulate pagination returning 30 links (3 pages)
        # First 5 are new (today's data), rest exist
        links = [
            *[{'date': f'2025-12-{7-i:02d}', 'url': f'https://example.com/new{i}.pdf'} 
              for i in range(5)],
            *[{'date': f'2025-11-{30-i:02d}', 'url': f'https://example.com/old{i}.pdf'} 
              for i in range(25)]
        ]
        
        # First 5 are new, rest exist
        app.db_manager.record_exists = Mock(side_effect=[False]*5 + [True]*25)
        app.db_manager.insert_record = Mock(return_value=True)
        app.csv_manager.append_record = Mock()
        app.db_manager.connect = Mock()
        app.db_manager.disconnect = Mock()
        
        app.process_links(links)
        
        # Should add 5 new records
        assert app.new_records_count == 5
        # Should stop after 10 consecutive duplicates (5 new + 10 duplicates = 15 checked)
        assert app.skipped_records_count == 10
        # Should NOT check all 30 (early stopping saves 15 checks)
        assert app.db_manager.record_exists.call_count == 15

    @patch('app.parse_arguments')
    def test_command_line_default_behavior(self, mock_parse_args, temp_dir):
        """Test that command line without flags uses smart defaults."""
        from app import main
        
        mock_parse_args.return_value = MagicMock(
            csv=str(Path(temp_dir) / "test.csv"),
            db=str(Path(temp_dir) / "test.db"),
            timeout=30,
            no_pagination=False,  # New negated argument
            max_pages=None,
            no_early_stopping=False,  # New negated argument
            early_stopping_threshold=10
        )
        
        with patch('app.FreeFloatScraperApp') as mock_app_class:
            mock_app_instance = Mock()
            mock_app_instance.run.return_value = 0
            mock_app_class.return_value = mock_app_instance
            
            main()
            
            # Should be called with smart defaults enabled
            call_kwargs = mock_app_class.call_args[1]
            # Default behavior should enable both (not no_pagination = False -> pagination = True)
            assert call_kwargs.get('use_post_pagination') is True
            assert call_kwargs.get('enable_early_stopping') is True
