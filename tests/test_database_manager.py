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
            cursor.execute(
                """
                SELECT name FROM sqlite_master
                WHERE type='table' AND name='free_float'
            """
            )
            result = cursor.fetchone()

            assert result is not None
            assert result["name"] == "free_float"

    def test_initialize_table_schema(self, db_manager):
        """Test that table has correct schema."""
        with db_manager:
            db_manager.initialize_table()

            cursor = db_manager._connection.cursor()
            cursor.execute("PRAGMA table_info(free_float)")
            columns = cursor.fetchall()

            column_names = [col["name"] for col in columns]
            assert "date" in column_names
            assert "url" in column_names
            assert "created_at" in column_names

    def test_initialize_table_not_connected(self, db_manager):
        """Test initialize_table raises error when not connected."""
        with pytest.raises(DatabaseManagerError) as excinfo:
            db_manager.initialize_table()

        assert "Not connected to database" in str(excinfo.value)

    def test_record_exists_false(self, db_manager):
        """Test record_exists returns False for non-existent record."""
        with db_manager:
            db_manager.initialize_table()

            exists = db_manager.record_exists("2025-12-04")
            assert exists is False

    def test_record_exists_true(self, db_manager):
        """Test record_exists returns True for existing record."""
        with db_manager:
            db_manager.initialize_table()

            # Insert a record
            cursor = db_manager._connection.cursor()
            cursor.execute(
                "INSERT INTO free_float (date, url) VALUES (?, ?)",
                ("2025-12-04", "https://example.com/test.pdf"),
            )
            db_manager._connection.commit()

            exists = db_manager.record_exists("2025-12-04")
            assert exists is True

    def test_record_exists_not_connected(self, db_manager):
        """Test record_exists raises error when not connected."""
        with pytest.raises(DatabaseManagerError) as excinfo:
            db_manager.record_exists("2025-12-04")

        assert "Not connected to database" in str(excinfo.value)

    def test_insert_record_success(self, db_manager):
        """Test successful record insertion."""
        with db_manager:
            db_manager.initialize_table()

            result = db_manager.insert_record("2025-12-04", "https://example.com/test.pdf")

            assert result is not None
            assert isinstance(result, int)
            assert db_manager.record_exists("2025-12-04") is True

    def test_insert_record_duplicate(self, db_manager):
        """Test inserting duplicate record returns False."""
        with db_manager:
            db_manager.initialize_table()

            # Insert first time
            result1 = db_manager.insert_record("2025-12-04", "https://example.com/test1.pdf")
            assert result1 is not None

            # Insert duplicate
            result2 = db_manager.insert_record("2025-12-04", "https://example.com/test2.pdf")
            assert result2 is None

    def test_insert_record_not_connected(self, db_manager):
        """Test insert_record raises error when not connected."""
        with pytest.raises(DatabaseManagerError) as excinfo:
            db_manager.insert_record("2025-12-04", "https://example.com/test.pdf")

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
            db_manager.insert_record("2025-12-04", "https://example.com/test1.pdf")
            db_manager.insert_record("2025-12-03", "https://example.com/test2.pdf")
            db_manager.insert_record("2025-12-05", "https://example.com/test3.pdf")

            records = db_manager.get_all_records()

            assert len(records) == 3
            # Records should be ordered by date DESC
            assert records[0]["date"] == "2025-12-05"
            assert records[1]["date"] == "2025-12-04"
            assert records[2]["date"] == "2025-12-03"

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

            db_manager.insert_record("2025-12-04", "https://example.com/test1.pdf")
            db_manager.insert_record("2025-12-03", "https://example.com/test2.pdf")

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
            assert (
                db_manager.insert_record("2025-12-04", "https://example.com/test1.pdf") is not None
            )
            assert (
                db_manager.insert_record("2025-12-03", "https://example.com/test2.pdf") is not None
            )

            # Check count
            assert db_manager.get_record_count() == 2

            # Check existence
            assert db_manager.record_exists("2025-12-04") is True
            assert db_manager.record_exists("2025-12-05") is False

            # Get all records
            records = db_manager.get_all_records()
            assert len(records) == 2

            # Try duplicate insert
            assert (
                db_manager.insert_record("2025-12-04", "https://example.com/duplicate.pdf") is None
            )
            assert db_manager.get_record_count() == 2


class TestPdfContentStorage:
    """Tests for pdf_content table APIs."""

    @pytest.fixture
    def temp_dir(self):
        temp_path = tempfile.mkdtemp()
        yield temp_path
        shutil.rmtree(temp_path)

    @pytest.fixture
    def db_manager(self, temp_dir):
        db_path = str(Path(temp_dir) / "test_pdf.db")
        return DatabaseManager(db_path)

    def test_initialize_tables_creates_pdf_content(self, db_manager):
        with db_manager:
            db_manager.initialize_tables()
            cursor = db_manager._connection.cursor()
            cursor.execute(
                """
                SELECT name FROM sqlite_master
                WHERE type='table' AND name='pdf_content'
                """
            )
            assert cursor.fetchone() is not None

    def test_pending_downloads_excludes_failed_and_downloaded(self, db_manager):
        with db_manager:
            db_manager.initialize_tables()
            id1 = db_manager.insert_record("2025-12-04", "https://example.com/a.pdf")
            id2 = db_manager.insert_record("2025-12-03", "https://example.com/b.pdf")
            id3 = db_manager.insert_record("2025-12-02", "https://example.com/c.pdf")

            db_manager.upsert_pdf_downloaded(id1, b"%PDF-a", 5, attempts=1)
            db_manager.mark_pdf_failed(id2, attempts=3, last_error="404")

            pending = db_manager.get_pending_pdf_downloads()
            assert len(pending) == 1
            assert pending[0]["id"] == id3
            assert pending[0]["date"] == "2025-12-02"

    def test_upsert_pdf_downloaded_stores_blob(self, db_manager):
        with db_manager:
            db_manager.initialize_tables()
            row_id = db_manager.insert_record("2025-12-04", "https://example.com/a.pdf")
            content = b"%PDF-1.4 test"
            db_manager.upsert_pdf_downloaded(row_id, content, len(content), attempts=2)

            cursor = db_manager._connection.cursor()
            cursor.execute(
                """
                SELECT content, size_bytes, status, attempts
                FROM pdf_content WHERE free_float_id = ?
                """,
                (row_id,),
            )
            row = cursor.fetchone()
            assert bytes(row["content"]) == content
            assert row["size_bytes"] == len(content)
            assert row["status"] == "downloaded"
            assert row["attempts"] == 2

    def test_mark_pdf_failed_and_clear(self, db_manager):
        with db_manager:
            db_manager.initialize_tables()
            row_id = db_manager.insert_record("2025-12-04", "https://example.com/a.pdf")
            db_manager.mark_pdf_failed(row_id, attempts=3, last_error="boom")

            pending = db_manager.get_pending_pdf_downloads()
            assert pending == []

            deleted = db_manager.clear_failed_pdf_downloads()
            assert deleted == 1

            pending = db_manager.get_pending_pdf_downloads()
            assert len(pending) == 1
            assert pending[0]["id"] == row_id

    def test_clear_failed_specific_id(self, db_manager):
        with db_manager:
            db_manager.initialize_tables()
            id1 = db_manager.insert_record("2025-12-04", "https://example.com/a.pdf")
            id2 = db_manager.insert_record("2025-12-03", "https://example.com/b.pdf")
            db_manager.mark_pdf_failed(id1, attempts=3, last_error="a")
            db_manager.mark_pdf_failed(id2, attempts=3, last_error="b")

            deleted = db_manager.clear_failed_pdf_downloads(free_float_id=id1)
            assert deleted == 1

            pending = db_manager.get_pending_pdf_downloads()
            assert len(pending) == 1
            assert pending[0]["id"] == id1


class TestStockIssueExtractionStorage:
    """Tests for stock_issue / issuer / stock_issue_daily and extract status."""

    @pytest.fixture
    def temp_dir(self):
        temp_path = tempfile.mkdtemp()
        yield temp_path
        shutil.rmtree(temp_path)

    @pytest.fixture
    def db_manager(self, temp_dir):
        return DatabaseManager(str(Path(temp_dir) / "extract.db"))

    def test_initialize_creates_stock_tables(self, db_manager):
        with db_manager:
            db_manager.initialize_tables()
            cursor = db_manager._connection.cursor()
            for name in ("stock_issue", "issuer", "stock_issue_daily"):
                cursor.execute(
                    "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
                    (name,),
                )
                assert cursor.fetchone() is not None

    def test_rename_keeps_same_stock_issue_id(self, db_manager):
        with db_manager:
            db_manager.initialize_tables()
            ff_old = db_manager.insert_record("2022-01-04", "https://example.com/old.pdf")
            ff_new = db_manager.insert_record("2026-07-23", "https://example.com/new.pdf")
            db_manager.upsert_pdf_downloaded(ff_old, b"%PDF-old", 8, attempts=1)
            db_manager.upsert_pdf_downloaded(ff_new, b"%PDF-new", 8, attempts=1)

            issue_id = db_manager.get_or_create_stock_issue("BG1100003166")
            db_manager.upsert_issuer(issue_id, ff_old, "АЛТЕРКО АД")
            db_manager.upsert_stock_issue_daily(issue_id, ff_old, 1, 2, 3)

            same_id = db_manager.get_or_create_stock_issue("BG1100003166")
            assert same_id == issue_id
            db_manager.upsert_issuer(issue_id, ff_new, "ШЕЛЛИ ГРУП ЕД")
            db_manager.upsert_stock_issue_daily(issue_id, ff_new, 4, 5, 6)

            cursor = db_manager._connection.cursor()
            cursor.execute("SELECT COUNT(*) AS c FROM stock_issue")
            assert cursor.fetchone()["c"] == 1
            cursor.execute(
                "SELECT name FROM issuer WHERE stock_issue_id=? ORDER BY free_float_id",
                (issue_id,),
            )
            names = [row["name"] for row in cursor.fetchall()]
            assert names == ["АЛТЕРКО АД", "ШЕЛЛИ ГРУП ЕД"]

    def test_save_extracted_rows_and_pending_extract(self, db_manager):
        with db_manager:
            db_manager.initialize_tables()
            ff_id = db_manager.insert_record("2026-07-23", "https://example.com/a.pdf")
            db_manager.upsert_pdf_downloaded(ff_id, b"%PDF-bytes", 10, attempts=1)

            pending = db_manager.get_pending_pdf_extractions()
            assert len(pending) == 1
            assert pending[0]["free_float_id"] == ff_id

            rows = [
                {
                    "isin": "BG1100003166",
                    "issuer_name": "ШЕЛЛИ ГРУП ЕД",
                    "total_shares": 10,
                    "free_float": 5,
                    "shareholders": 2,
                }
            ]
            db_manager.save_extracted_rows(ff_id, rows)
            db_manager.mark_pdf_extracted(ff_id)

            assert db_manager.get_pending_pdf_extractions() == []

    def test_extract_failed_skipped_until_cleared(self, db_manager):
        with db_manager:
            db_manager.initialize_tables()
            ff_id = db_manager.insert_record("2026-07-23", "https://example.com/a.pdf")
            db_manager.upsert_pdf_downloaded(ff_id, b"%PDF-bytes", 10, attempts=1)
            db_manager.mark_pdf_extract_failed(ff_id, attempts=1, last_error="bad")

            assert db_manager.get_pending_pdf_extractions() == []
            cleared = db_manager.clear_failed_pdf_extractions()
            assert cleared == 1
            assert len(db_manager.get_pending_pdf_extractions()) == 1
