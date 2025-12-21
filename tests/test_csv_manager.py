"""Tests for the CSVManager class."""

import pytest
import csv
from pathlib import Path
import tempfile
import shutil
from src.csv_manager import CSVManager, CSVManagerError


class TestCSVManager:
    """Test suite for CSVManager class."""

    @pytest.fixture
    def temp_dir(self):
        """Create a temporary directory for testing."""
        temp_path = tempfile.mkdtemp()
        yield temp_path
        shutil.rmtree(temp_path)

    @pytest.fixture
    def csv_path(self, temp_dir):
        """Create a temporary CSV file path."""
        return str(Path(temp_dir) / "test_free_float.csv")

    @pytest.fixture
    def csv_manager(self, csv_path):
        """Create a CSVManager instance for testing."""
        return CSVManager(csv_path)

    def test_initialization(self, csv_manager, csv_path):
        """Test CSVManager initialization."""
        assert str(csv_manager.csv_path) == csv_path
        assert csv_manager.FIELDNAMES == ['date', 'url']

    def test_ensure_csv_directory_creates_path(self, temp_dir):
        """Test that directory is created if it doesn't exist."""
        nested_path = str(Path(temp_dir) / "nested" / "path" / "test.csv")
        manager = CSVManager(nested_path)
        
        assert manager.csv_path.parent.exists()

    def test_file_exists_and_has_content_false_no_file(self, csv_manager):
        """Test _file_exists_and_has_content returns False when file doesn't exist."""
        assert csv_manager._file_exists_and_has_content() is False

    def test_file_exists_and_has_content_false_empty_file(self, csv_manager):
        """Test _file_exists_and_has_content returns False for empty file."""
        # Create empty file
        csv_manager.csv_path.touch()
        
        assert csv_manager._file_exists_and_has_content() is False

    def test_file_exists_and_has_content_true(self, csv_manager):
        """Test _file_exists_and_has_content returns True for non-empty file."""
        # Create file with content
        with open(csv_manager.csv_path, 'w') as f:
            f.write("test")
        
        assert csv_manager._file_exists_and_has_content() is True

    def test_initialize_file_creates_new_file(self, csv_manager):
        """Test initialize_file creates new file with headers."""
        csv_manager.initialize_file()
        
        assert csv_manager.csv_path.exists()
        
        # Read and verify headers
        with open(csv_manager.csv_path, 'r', newline='', encoding='utf-8') as f:
            reader = csv.reader(f)
            headers = next(reader)
            assert headers == ['date', 'url']

    def test_initialize_file_doesnt_overwrite_existing(self, csv_manager):
        """Test initialize_file doesn't overwrite existing file."""
        # Create file with data
        with open(csv_manager.csv_path, 'w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=['date', 'url'])
            writer.writeheader()
            writer.writerow({'date': '2025-12-04', 'url': 'https://example.com/test.pdf'})
        
        # Call initialize
        csv_manager.initialize_file()
        
        # Verify data still exists
        records = csv_manager.read_all_records()
        assert len(records) == 1
        assert records[0]['date'] == '2025-12-04'

    def test_append_record_to_new_file(self, csv_manager):
        """Test appending record to new file creates headers first."""
        csv_manager.append_record('2025-12-04', 'https://example.com/test.pdf')
        
        assert csv_manager.csv_path.exists()
        
        # Read and verify
        with open(csv_manager.csv_path, 'r', newline='', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            records = list(reader)
            
            assert len(records) == 1
            assert records[0]['date'] == '2025-12-04'
            assert records[0]['url'] == 'https://example.com/test.pdf'

    def test_append_record_to_existing_file(self, csv_manager):
        """Test appending record to existing file."""
        # Initialize file
        csv_manager.initialize_file()
        
        # Append first record
        csv_manager.append_record('2025-12-04', 'https://example.com/test1.pdf')
        
        # Append second record
        csv_manager.append_record('2025-12-03', 'https://example.com/test2.pdf')
        
        # Read and verify
        records = csv_manager.read_all_records()
        assert len(records) == 2
        assert records[0]['date'] == '2025-12-04'
        assert records[1]['date'] == '2025-12-03'

    def test_append_record_multiple_times(self, csv_manager):
        """Test appending multiple records."""
        dates_and_urls = [
            ('2025-12-04', 'https://example.com/test1.pdf'),
            ('2025-12-03', 'https://example.com/test2.pdf'),
            ('2025-12-02', 'https://example.com/test3.pdf'),
        ]
        
        for date, url in dates_and_urls:
            csv_manager.append_record(date, url)
        
        records = csv_manager.read_all_records()
        assert len(records) == 3
        
        for i, (date, url) in enumerate(dates_and_urls):
            assert records[i]['date'] == date
            assert records[i]['url'] == url

    def test_read_all_records_empty_file(self, csv_manager):
        """Test read_all_records with non-existent file."""
        records = csv_manager.read_all_records()
        assert records == []

    def test_read_all_records_only_headers(self, csv_manager):
        """Test read_all_records with file containing only headers."""
        csv_manager.initialize_file()
        
        records = csv_manager.read_all_records()
        assert records == []

    def test_read_all_records_with_data(self, csv_manager):
        """Test read_all_records retrieves all records."""
        # Add records
        csv_manager.append_record('2025-12-04', 'https://example.com/test1.pdf')
        csv_manager.append_record('2025-12-03', 'https://example.com/test2.pdf')
        
        records = csv_manager.read_all_records()
        
        assert len(records) == 2
        assert records[0]['date'] == '2025-12-04'
        assert records[0]['url'] == 'https://example.com/test1.pdf'
        assert records[1]['date'] == '2025-12-03'
        assert records[1]['url'] == 'https://example.com/test2.pdf'

    def test_get_record_count_no_file(self, csv_manager):
        """Test get_record_count with no file."""
        count = csv_manager.get_record_count()
        assert count == 0

    def test_get_record_count_empty_file(self, csv_manager):
        """Test get_record_count with empty file."""
        csv_manager.initialize_file()
        
        count = csv_manager.get_record_count()
        assert count == 0

    def test_get_record_count_with_data(self, csv_manager):
        """Test get_record_count returns correct count."""
        csv_manager.append_record('2025-12-04', 'https://example.com/test1.pdf')
        csv_manager.append_record('2025-12-03', 'https://example.com/test2.pdf')
        csv_manager.append_record('2025-12-02', 'https://example.com/test3.pdf')
        
        count = csv_manager.get_record_count()
        assert count == 3

    def test_csv_encoding_utf8(self, csv_manager):
        """Test that CSV handles UTF-8 encoding correctly."""
        # Append record with non-ASCII characters
        csv_manager.append_record('2025-12-04', 'https://csd-bg.bg/ffloat/FREE_FLOAT_за_2025.pdf')
        
        records = csv_manager.read_all_records()
        assert len(records) == 1
        assert 'за' in records[0]['url']

    def test_full_workflow(self, csv_manager):
        """Test complete workflow with multiple operations."""
        # Initialize
        csv_manager.initialize_file()
        assert csv_manager.get_record_count() == 0
        
        # Append records
        csv_manager.append_record('2025-12-04', 'https://example.com/test1.pdf')
        csv_manager.append_record('2025-12-03', 'https://example.com/test2.pdf')
        
        # Check count
        assert csv_manager.get_record_count() == 2
        
        # Read all
        records = csv_manager.read_all_records()
        assert len(records) == 2
        
        # Append more
        csv_manager.append_record('2025-12-02', 'https://example.com/test3.pdf')
        
        # Verify total
        assert csv_manager.get_record_count() == 3
