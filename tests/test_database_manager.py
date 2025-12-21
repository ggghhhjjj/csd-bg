"""Tests for the DatabaseManager class."""

import pytest
import sqlite3
from pathlib import Path
import tempfile
import shutil
from src.database_manager import DatabaseManager, DatabaseManagerError


class TestDatabaseManager:
    """Test suite for DatabaseManager class."""

    @pytest.fixture
    def temp_dir(self):
        """Create a temporary directory for testing."""
        temp_path = tempfile.mkdtemp()
        yield temp_path
        shutil.rmtree(temp_path)

    @pytest.fixture
    def db_path(self, temp_dir):
        """Create a temporary database path."""
        return str(Path(temp_dir) / "test_free_float.db")

    @pytest.fixture
    def db_manager(self, db_path):
        """Create a DatabaseManager instance for testing."""
        return DatabaseManager(db_path)

    def test_initialization(self, db_manager, db_path):
        """Test DatabaseManager initialization."""
        assert str(db_manager.db_path) == db_path
        assert db_manager._connection is None

    def test_ensure_db_directory_creates_path(self, temp_dir):
        """Test that directory is created if it doesn't exist."""
        nested_path = str(Path(temp_dir) / "nested" / "path" / "test.db")
        manager = DatabaseManager(nested_path)
        
        assert manager.db_path.parent.exists()

    def test_connect(self, db_manager):
        """Test database connection."""
        db_manager.connect()
        
        assert db_manager._connection is not None
        assert isinstance(db_manager._connection, sqlite3.Connection)
        
        db_manager.disconnect()

    def test_disconnect(self, db_manager):
        """Test database disconnection."""
        db_manager.connect()
        assert db_manager._connection is not None
        
        db_manager.disconnect()
        assert db_manager._connection is None

    def test_context_manager(self, db_manager):
        """Test DatabaseManager as context manager."""
        with db_manager as manager:
            assert manager._connection is not None
        
        assert db_manager._connection is None

    def test_initialize_table(self, db_manager):
        """Test table initialization."""
        with db_manager:
            db_manager.initialize_table()
            
            # Verify table exists
            cursor = db_manager._connection.cursor()
            cursor.execute("""
                SELECT name FROM sqlite_master 
                WHERE type='table' AND name='free_float'
            """)
            result = cursor.fetchone()
            
            assert result is not None
            assert result['name'] == 'free_float'

    def test_initialize_table_schema(self, db_manager):
        """Test that table has correct schema."""
        with db_manager:
            db_manager.initialize_table()
            
            cursor = db_manager._connection.cursor()
            cursor.execute("PRAGMA table_info(free_float)")
            columns = cursor.fetchall()
            
            column_names = [col['name'] for col in columns]
            assert 'date' in column_names
            assert 'url' in column_names
            assert 'created_at' in column_names

    def test_initialize_table_not_connected(self, db_manager):
        """Test initialize_table raises error when not connected."""
        with pytest.raises(DatabaseManagerError) as excinfo:
            db_manager.initialize_table()
        
        assert "Not connected to database" in str(excinfo.value)

    def test_record_exists_false(self, db_manager):
        """Test record_exists returns False for non-existent record."""
        with db_manager:
            db_manager.initialize_table()
            
            exists = db_manager.record_exists('2025-12-04')
            assert exists is False

    def test_record_exists_true(self, db_manager):
        """Test record_exists returns True for existing record."""
        with db_manager:
            db_manager.initialize_table()
            
            # Insert a record
            cursor = db_manager._connection.cursor()
            cursor.execute(
                "INSERT INTO free_float (date, url) VALUES (?, ?)",
                ('2025-12-04', 'https://example.com/test.pdf')
            )
            db_manager._connection.commit()
            
            exists = db_manager.record_exists('2025-12-04')
            assert exists is True

    def test_record_exists_not_connected(self, db_manager):
        """Test record_exists raises error when not connected."""
        with pytest.raises(DatabaseManagerError) as excinfo:
            db_manager.record_exists('2025-12-04')
        
        assert "Not connected to database" in str(excinfo.value)

    def test_insert_record_success(self, db_manager):
        """Test successful record insertion."""
        with db_manager:
            db_manager.initialize_table()
            
            result = db_manager.insert_record('2025-12-04', 'https://example.com/test.pdf')
            
            assert result is True
            assert db_manager.record_exists('2025-12-04') is True

    def test_insert_record_duplicate(self, db_manager):
        """Test inserting duplicate record returns False."""
        with db_manager:
            db_manager.initialize_table()
            
            # Insert first time
            result1 = db_manager.insert_record('2025-12-04', 'https://example.com/test1.pdf')
            assert result1 is True
            
            # Insert duplicate
            result2 = db_manager.insert_record('2025-12-04', 'https://example.com/test2.pdf')
            assert result2 is False

    def test_insert_record_not_connected(self, db_manager):
        """Test insert_record raises error when not connected."""
        with pytest.raises(DatabaseManagerError) as excinfo:
            db_manager.insert_record('2025-12-04', 'https://example.com/test.pdf')
        
        assert "Not connected to database" in str(excinfo.value)

    def test_get_all_records_empty(self, db_manager):
        """Test get_all_records with empty table."""
        with db_manager:
            db_manager.initialize_table()
            
            records = db_manager.get_all_records()
            assert records == []

    def test_get_all_records_with_data(self, db_manager):
        """Test get_all_records retrieves all records."""
        with db_manager:
            db_manager.initialize_table()
            
            # Insert multiple records
            db_manager.insert_record('2025-12-04', 'https://example.com/test1.pdf')
            db_manager.insert_record('2025-12-03', 'https://example.com/test2.pdf')
            db_manager.insert_record('2025-12-05', 'https://example.com/test3.pdf')
            
            records = db_manager.get_all_records()
            
            assert len(records) == 3
            # Records should be ordered by date DESC
            assert records[0]['date'] == '2025-12-05'
            assert records[1]['date'] == '2025-12-04'
            assert records[2]['date'] == '2025-12-03'

    def test_get_all_records_not_connected(self, db_manager):
        """Test get_all_records raises error when not connected."""
        with pytest.raises(DatabaseManagerError) as excinfo:
            db_manager.get_all_records()
        
        assert "Not connected to database" in str(excinfo.value)

    def test_get_record_count_empty(self, db_manager):
        """Test get_record_count with empty table."""
        with db_manager:
            db_manager.initialize_table()
            
            count = db_manager.get_record_count()
            assert count == 0

    def test_get_record_count_with_data(self, db_manager):
        """Test get_record_count returns correct count."""
        with db_manager:
            db_manager.initialize_table()
            
            db_manager.insert_record('2025-12-04', 'https://example.com/test1.pdf')
            db_manager.insert_record('2025-12-03', 'https://example.com/test2.pdf')
            
            count = db_manager.get_record_count()
            assert count == 2

    def test_get_record_count_not_connected(self, db_manager):
        """Test get_record_count raises error when not connected."""
        with pytest.raises(DatabaseManagerError) as excinfo:
            db_manager.get_record_count()
        
        assert "Not connected to database" in str(excinfo.value)

    def test_full_workflow(self, db_manager):
        """Test complete workflow with multiple operations."""
        with db_manager:
            # Initialize
            db_manager.initialize_table()
            assert db_manager.get_record_count() == 0
            
            # Insert records
            assert db_manager.insert_record('2025-12-04', 'https://example.com/test1.pdf') is True
            assert db_manager.insert_record('2025-12-03', 'https://example.com/test2.pdf') is True
            
            # Check count
            assert db_manager.get_record_count() == 2
            
            # Check existence
            assert db_manager.record_exists('2025-12-04') is True
            assert db_manager.record_exists('2025-12-05') is False
            
            # Get all records
            records = db_manager.get_all_records()
            assert len(records) == 2
            
            # Try duplicate insert
            assert db_manager.insert_record('2025-12-04', 'https://example.com/duplicate.pdf') is False
            assert db_manager.get_record_count() == 2
