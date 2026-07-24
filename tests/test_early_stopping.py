"""Tests for early stopping optimization when all records already exist."""

import pytest
from unittest.mock import Mock, MagicMock
from pathlib import Path
import tempfile
import shutil

from app import FreeFloatScraperApp


class TestEarlyStoppingOptimization:
    """Test suite for early stopping when consecutive duplicates are found."""

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
        return FreeFloatScraperApp(csv_path, db_path, timeout=10, enable_early_stopping=True)

    def test_early_stopping_all_duplicates(self, app):
        """Test early stopping when first 10 records all exist (default threshold)."""
        # Simulate 20 links, all exist in database
        links = [
            {'date': f'2025-12-{i:02d}', 'url': f'https://example.com/test{i}.pdf'}
            for i in range(20, 0, -1)
        ]
        
        app.db_manager.record_exists = Mock(return_value=True)
        app.db_manager.connect = Mock()
        app.db_manager.disconnect = Mock()
        
        app.process_links(links)
        
        # Should stop after 10 consecutive duplicates (default threshold)
        # So only 10 checks should be made, not 20
        assert app.db_manager.record_exists.call_count == 10
        assert app.new_records_count == 0
        assert app.skipped_records_count == 10

    def test_early_stopping_custom_threshold(self, temp_dir):
        """Test early stopping with custom threshold."""
        csv_path = str(Path(temp_dir) / "test.csv")
        db_path = str(Path(temp_dir) / "test.db")
        app = FreeFloatScraperApp(
            csv_path, 
            db_path, 
            enable_early_stopping=True,
            early_stopping_threshold=5  # Stop after 5 consecutive duplicates
        )
        
        links = [
            {'date': f'2025-12-{i:02d}', 'url': f'https://example.com/test{i}.pdf'}
            for i in range(20, 0, -1)
        ]
        
        app.db_manager.record_exists = Mock(return_value=True)
        app.db_manager.connect = Mock()
        app.db_manager.disconnect = Mock()
        
        app.process_links(links)
        
        # Should stop after 5 consecutive duplicates
        assert app.db_manager.record_exists.call_count == 5
        assert app.skipped_records_count == 5

    def test_no_early_stopping_when_disabled(self, temp_dir):
        """Test that early stopping doesn't occur when disabled."""
        csv_path = str(Path(temp_dir) / "test.csv")
        db_path = str(Path(temp_dir) / "test.db")
        app = FreeFloatScraperApp(
            csv_path, 
            db_path, 
            enable_early_stopping=False  # Disabled
        )
        
        links = [
            {'date': f'2025-12-{i:02d}', 'url': f'https://example.com/test{i}.pdf'}
            for i in range(20, 0, -1)
        ]
        
        app.db_manager.record_exists = Mock(return_value=True)
        app.db_manager.connect = Mock()
        app.db_manager.disconnect = Mock()
        
        app.process_links(links)
        
        # Should check all 20 links (no early stopping)
        assert app.db_manager.record_exists.call_count == 20
        assert app.skipped_records_count == 20

    def test_early_stopping_reset_on_new_record(self, app):
        """Test that duplicate counter resets when new record is found."""
        links = [
            {'date': '2025-12-20', 'url': 'https://example.com/test1.pdf'},  # exists
            {'date': '2025-12-19', 'url': 'https://example.com/test2.pdf'},  # exists
            {'date': '2025-12-18', 'url': 'https://example.com/test3.pdf'},  # exists
            {'date': '2025-12-17', 'url': 'https://example.com/test4.pdf'},  # NEW - resets counter
            {'date': '2025-12-16', 'url': 'https://example.com/test5.pdf'},  # exists
            {'date': '2025-12-15', 'url': 'https://example.com/test6.pdf'},  # exists
        ]
        
        # First 3 exist, 4th is new, last 2 exist
        app.db_manager.record_exists = Mock(side_effect=[True, True, True, False, True, True])
        app.db_manager.insert_record = Mock(return_value=True)
        app.csv_manager.append_record = Mock()
        app.db_manager.connect = Mock()
        app.db_manager.disconnect = Mock()
        
        app.process_links(links)
        
        # Should process all 6 because new record in middle resets counter
        assert app.db_manager.record_exists.call_count == 6
        assert app.new_records_count == 1
        assert app.skipped_records_count == 5

    def test_early_stopping_mixed_scenario(self, app):
        """Test early stopping in realistic scenario."""
        # Simulate pagination: first page has mix, subsequent pages all exist
        links = [
            # First page - some new
            {'date': '2025-12-20', 'url': 'https://example.com/test1.pdf'},  # new
            {'date': '2025-12-19', 'url': 'https://example.com/test2.pdf'},  # new
            # Rest all exist (would trigger early stopping)
            *[{'date': f'2025-12-{i:02d}', 'url': f'https://example.com/test{i}.pdf'} 
              for i in range(18, 8, -1)]
        ]
        
        # First 2 are new, rest exist
        app.db_manager.record_exists = Mock(
            side_effect=[False, False] + [True] * 20
        )
        app.db_manager.insert_record = Mock(return_value=True)
        app.csv_manager.append_record = Mock()
        app.db_manager.connect = Mock()
        app.db_manager.disconnect = Mock()
        
        app.process_links(links)
        
        # Should stop after: 2 new + 10 consecutive existing = 12 checks
        assert app.db_manager.record_exists.call_count == 12
        assert app.new_records_count == 2
        assert app.skipped_records_count == 10

    def test_early_stopping_prevents_unnecessary_processing(self, app):
        """Test that early stopping saves processing time."""
        # 100 links, all exist
        links = [
            {'date': f'2025-{(i // 30) + 1:02d}-{(i % 30) + 1:02d}', 
             'url': f'https://example.com/test{i}.pdf'}
            for i in range(100)
        ]
        
        app.db_manager.record_exists = Mock(return_value=True)
        app.db_manager.connect = Mock()
        app.db_manager.disconnect = Mock()
        
        app.process_links(links)
        
        # Should only check first 10 (threshold), not all 100
        assert app.db_manager.record_exists.call_count == 10
        assert app.skipped_records_count == 10
        # Saved 90 unnecessary database checks!

    def test_early_stopping_logging(self, app, caplog):
        """Test that early stopping is logged properly."""
        import logging
        caplog.set_level(logging.INFO)
        
        links = [
            {'date': f'2025-12-{i:02d}', 'url': f'https://example.com/test{i}.pdf'}
            for i in range(20, 10, -1)
        ]
        
        app.db_manager.record_exists = Mock(return_value=True)
        app.db_manager.connect = Mock()
        app.db_manager.disconnect = Mock()
        
        app.process_links(links)
        
        # Check that early stopping was logged
        assert any("Early stopping" in record.message for record in caplog.records)
        assert any("consecutive duplicate" in record.message for record in caplog.records)
