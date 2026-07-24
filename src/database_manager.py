"""Database manager module for SQLite operations."""

import sqlite3
from typing import Optional, List, Dict, Any
from pathlib import Path
import logging


logger = logging.getLogger(__name__)


class DatabaseManagerError(Exception):
    """Custom exception for database operations."""

    pass


class DatabaseManager:
    """
    Manager for SQLite database operations.

    Handles database initialization, record insertion, and existence checks
    for Free Float records and downloaded PDF content.
    """

    def __init__(self, db_path: str):
        """
        Initialize the DatabaseManager.

        Args:
            db_path: Path to the SQLite database file
        """
        self.db_path = Path(db_path)
        self._ensure_db_directory()
        self._connection: Optional[sqlite3.Connection] = None

    def _ensure_db_directory(self) -> None:
        """Ensure the database directory exists."""
        self.db_path.parent.mkdir(parents=True, exist_ok=True)

    def connect(self) -> None:
        """
        Establish connection to the database.

        Raises:
            DatabaseManagerError: If connection fails
        """
        try:
            self._connection = sqlite3.connect(str(self.db_path))
            self._connection.row_factory = sqlite3.Row
            self._connection.execute("PRAGMA foreign_keys = ON")
            logger.info(f"Connected to database: {self.db_path}")
        except sqlite3.Error as e:
            raise DatabaseManagerError(f"Failed to connect to database: {str(e)}") from e

    def disconnect(self) -> None:
        """Close the database connection."""
        if self._connection:
            self._connection.close()
            self._connection = None
            logger.info("Database connection closed")

    def __enter__(self):
        """Context manager entry."""
        self.connect()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit."""
        self.disconnect()

    def _require_connection(self) -> sqlite3.Connection:
        """Return the active connection or raise if disconnected."""
        if not self._connection:
            raise DatabaseManagerError("Not connected to database")
        return self._connection

    def initialize_tables(self) -> None:
        """
        Create free_float and pdf_content tables if they do not exist.

        Raises:
            DatabaseManagerError: If table creation fails
        """
        connection = self._require_connection()

        try:
            cursor = connection.cursor()
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS free_float (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    date TEXT NOT NULL UNIQUE,
                    url TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS pdf_content (
                    free_float_id INTEGER PRIMARY KEY,
                    content BLOB,
                    size_bytes INTEGER,
                    status TEXT NOT NULL CHECK(status IN ('downloaded', 'failed')),
                    attempts INTEGER NOT NULL DEFAULT 0,
                    last_error TEXT,
                    downloaded_at TIMESTAMP,
                    failed_at TIMESTAMP,
                    extract_status TEXT CHECK(
                        extract_status IS NULL
                        OR extract_status IN ('extracted', 'failed')
                    ),
                    extract_attempts INTEGER NOT NULL DEFAULT 0,
                    extract_last_error TEXT,
                    extracted_at TIMESTAMP,
                    extract_failed_at TIMESTAMP,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (free_float_id) REFERENCES free_float(id)
                )
                """
            )
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS stock_issue (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    isin TEXT NOT NULL UNIQUE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS issuer (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    stock_issue_id INTEGER NOT NULL REFERENCES stock_issue(id),
                    free_float_id INTEGER NOT NULL REFERENCES free_float(id),
                    name TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(stock_issue_id, free_float_id)
                )
                """
            )
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS stock_issue_daily (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    stock_issue_id INTEGER NOT NULL REFERENCES stock_issue(id),
                    free_float_id INTEGER NOT NULL REFERENCES free_float(id),
                    total_shares INTEGER NOT NULL,
                    free_float INTEGER NOT NULL,
                    shareholders INTEGER NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(stock_issue_id, free_float_id)
                )
                """
            )
            self._migrate_pdf_content_extract_columns(cursor)
            connection.commit()
            logger.info(
                "Tables free_float, pdf_content, stock_issue, issuer, "
                "stock_issue_daily initialized"
            )
        except sqlite3.Error as e:
            raise DatabaseManagerError(f"Failed to initialize tables: {str(e)}") from e

    def _migrate_pdf_content_extract_columns(self, cursor: sqlite3.Cursor) -> None:
        """Add extract_* columns to pdf_content when upgrading older databases."""
        cursor.execute("PRAGMA table_info(pdf_content)")
        existing = {row["name"] for row in cursor.fetchall()}
        alterations = {
            "extract_status": "TEXT",
            "extract_attempts": "INTEGER NOT NULL DEFAULT 0",
            "extract_last_error": "TEXT",
            "extracted_at": "TIMESTAMP",
            "extract_failed_at": "TIMESTAMP",
        }
        for column, typedef in alterations.items():
            if column not in existing:
                cursor.execute(f"ALTER TABLE pdf_content ADD COLUMN {column} {typedef}")

    def initialize_table(self) -> None:
        """
        Create tables if they do not exist.

        Kept for backward compatibility; prefers initialize_tables().
        """
        self.initialize_tables()

    def record_exists(self, date: str) -> bool:
        """
        Check if a record with the given date exists.

        Args:
            date: Date string in YYYY-MM-DD format

        Returns:
            True if record exists, False otherwise

        Raises:
            DatabaseManagerError: If query fails
        """
        connection = self._require_connection()

        try:
            cursor = connection.cursor()
            cursor.execute("SELECT 1 FROM free_float WHERE date = ?", (date,))
            result = cursor.fetchone()
            return result is not None
        except sqlite3.Error as e:
            raise DatabaseManagerError(f"Failed to check record existence: {str(e)}") from e

    def insert_record(self, date: str, url: str) -> Optional[int]:
        """
        Insert a new record into the database.

        Args:
            date: Date string in YYYY-MM-DD format
            url: Full URL to the PDF file

        Returns:
            Inserted row id on success, None if record already exists

        Raises:
            DatabaseManagerError: If insertion fails
        """
        connection = self._require_connection()

        if self.record_exists(date):
            logger.info(f"Record for date {date} already exists")
            return None

        try:
            cursor = connection.cursor()
            cursor.execute(
                "INSERT INTO free_float (date, url) VALUES (?, ?)",
                (date, url),
            )
            connection.commit()
            row_id = cursor.lastrowid
            logger.info(f"Inserted record: id={row_id}, date={date}, url={url}")
            return row_id
        except sqlite3.IntegrityError:
            logger.warning(f"Record for date {date} already exists (race condition)")
            return None
        except sqlite3.Error as e:
            raise DatabaseManagerError(f"Failed to insert record: {str(e)}") from e

    def get_all_records(self) -> List[Dict[str, str]]:
        """
        Retrieve all records from the database.

        Returns:
            List of dictionaries containing record data

        Raises:
            DatabaseManagerError: If query fails
        """
        connection = self._require_connection()

        try:
            cursor = connection.cursor()
            cursor.execute("SELECT date, url, created_at FROM free_float ORDER BY date DESC")
            rows = cursor.fetchall()
            return [dict(row) for row in rows]
        except sqlite3.Error as e:
            raise DatabaseManagerError(f"Failed to retrieve records: {str(e)}") from e

    def get_record_count(self) -> int:
        """
        Get the total number of records in the database.

        Returns:
            Number of records

        Raises:
            DatabaseManagerError: If query fails
        """
        connection = self._require_connection()

        try:
            cursor = connection.cursor()
            cursor.execute("SELECT COUNT(*) as count FROM free_float")
            result = cursor.fetchone()
            return int(result["count"]) if result else 0
        except sqlite3.Error as e:
            raise DatabaseManagerError(f"Failed to count records: {str(e)}") from e

    def get_pending_pdf_downloads(self) -> List[Dict[str, Any]]:
        """
        Return free_float rows that have no pdf_content row yet.

        Failed downloads are excluded (they already have a pdf_content row).

        Returns:
            List of dicts with id, date, url ordered by date DESC

        Raises:
            DatabaseManagerError: If query fails
        """
        connection = self._require_connection()

        try:
            cursor = connection.cursor()
            cursor.execute(
                """
                SELECT ff.id, ff.date, ff.url
                FROM free_float ff
                LEFT JOIN pdf_content pc ON pc.free_float_id = ff.id
                WHERE pc.free_float_id IS NULL
                ORDER BY ff.date DESC
                """
            )
            return [dict(row) for row in cursor.fetchall()]
        except sqlite3.Error as e:
            raise DatabaseManagerError(f"Failed to retrieve pending PDF downloads: {str(e)}") from e

    def upsert_pdf_downloaded(
        self, free_float_id: int, content: bytes, size_bytes: int, attempts: int
    ) -> None:
        """
        Store downloaded PDF bytes for a free_float row.

        Args:
            free_float_id: Foreign key to free_float.id
            content: PDF binary content
            size_bytes: Length of content in bytes
            attempts: Number of download attempts used

        Raises:
            DatabaseManagerError: If upsert fails
        """
        connection = self._require_connection()

        try:
            cursor = connection.cursor()
            cursor.execute(
                """
                INSERT INTO pdf_content (
                    free_float_id, content, size_bytes, status, attempts,
                    last_error, downloaded_at, failed_at, updated_at
                ) VALUES (
                    ?, ?, ?, 'downloaded', ?,
                    NULL, CURRENT_TIMESTAMP, NULL, CURRENT_TIMESTAMP
                )
                ON CONFLICT(free_float_id) DO UPDATE SET
                    content = excluded.content,
                    size_bytes = excluded.size_bytes,
                    status = 'downloaded',
                    attempts = excluded.attempts,
                    last_error = NULL,
                    downloaded_at = CURRENT_TIMESTAMP,
                    failed_at = NULL,
                    updated_at = CURRENT_TIMESTAMP
                """,
                (free_float_id, content, size_bytes, attempts),
            )
            connection.commit()
            logger.info(
                "Stored PDF content for free_float_id=%s (%s bytes)",
                free_float_id,
                size_bytes,
            )
        except sqlite3.Error as e:
            raise DatabaseManagerError(
                f"Failed to store PDF content for id {free_float_id}: {str(e)}"
            ) from e

    def mark_pdf_failed(self, free_float_id: int, attempts: int, last_error: str) -> None:
        """
        Mark a PDF download as permanently failed until cleared.

        Args:
            free_float_id: Foreign key to free_float.id
            attempts: Number of download attempts made
            last_error: Error message from the final attempt

        Raises:
            DatabaseManagerError: If update fails
        """
        connection = self._require_connection()

        try:
            cursor = connection.cursor()
            cursor.execute(
                """
                INSERT INTO pdf_content (
                    free_float_id, content, size_bytes, status, attempts,
                    last_error, downloaded_at, failed_at, updated_at
                ) VALUES (
                    ?, NULL, NULL, 'failed', ?,
                    ?, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                )
                ON CONFLICT(free_float_id) DO UPDATE SET
                    content = NULL,
                    size_bytes = NULL,
                    status = 'failed',
                    attempts = excluded.attempts,
                    last_error = excluded.last_error,
                    downloaded_at = NULL,
                    failed_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
                """,
                (free_float_id, attempts, last_error),
            )
            connection.commit()
            logger.warning(
                "Marked PDF download failed for free_float_id=%s: %s",
                free_float_id,
                last_error,
            )
        except sqlite3.Error as e:
            raise DatabaseManagerError(
                f"Failed to mark PDF failed for id {free_float_id}: {str(e)}"
            ) from e

    def clear_failed_pdf_downloads(self, free_float_id: Optional[int] = None) -> int:
        """
        Remove failed pdf_content rows so downloads can be retried.

        Args:
            free_float_id: Optional specific free_float id; clears all failed if None

        Returns:
            Number of rows deleted

        Raises:
            DatabaseManagerError: If delete fails
        """
        connection = self._require_connection()

        try:
            cursor = connection.cursor()
            if free_float_id is None:
                cursor.execute("DELETE FROM pdf_content WHERE status = 'failed'")
            else:
                cursor.execute(
                    """
                    DELETE FROM pdf_content
                    WHERE status = 'failed' AND free_float_id = ?
                    """,
                    (free_float_id,),
                )
            connection.commit()
            deleted = cursor.rowcount if cursor.rowcount is not None else 0
            logger.info("Cleared %s failed PDF download mark(s)", deleted)
            return deleted
        except sqlite3.Error as e:
            raise DatabaseManagerError(f"Failed to clear failed PDF downloads: {str(e)}") from e

    def get_pending_pdf_extractions(self) -> List[Dict[str, Any]]:
        """
        Return downloaded PDFs that have not been extracted yet.

        Failed extractions are excluded until cleared.

        Returns:
            List of dicts with free_float_id, date, content ordered by date DESC
        """
        connection = self._require_connection()

        try:
            cursor = connection.cursor()
            cursor.execute(
                """
                SELECT ff.id AS free_float_id, ff.date, pc.content
                FROM free_float ff
                INNER JOIN pdf_content pc ON pc.free_float_id = ff.id
                WHERE pc.status = 'downloaded'
                  AND pc.content IS NOT NULL
                  AND pc.extract_status IS NULL
                ORDER BY ff.date DESC
                """
            )
            return [dict(row) for row in cursor.fetchall()]
        except sqlite3.Error as e:
            raise DatabaseManagerError(
                f"Failed to retrieve pending PDF extractions: {str(e)}"
            ) from e

    def get_or_create_stock_issue(self, isin: str) -> int:
        """
        Return stock_issue id for ISIN, inserting a new row when needed.
        """
        connection = self._require_connection()

        try:
            cursor = connection.cursor()
            cursor.execute("SELECT id FROM stock_issue WHERE isin = ?", (isin,))
            row = cursor.fetchone()
            if row:
                return int(row["id"])
            cursor.execute("INSERT INTO stock_issue (isin) VALUES (?)", (isin,))
            connection.commit()
            return int(cursor.lastrowid)
        except sqlite3.Error as e:
            raise DatabaseManagerError(
                f"Failed to get or create stock_issue for {isin}: {str(e)}"
            ) from e

    def upsert_issuer(self, stock_issue_id: int, free_float_id: int, name: str) -> None:
        """Upsert issuer name observed for a stock issue on a PDF date."""
        connection = self._require_connection()

        try:
            cursor = connection.cursor()
            cursor.execute(
                """
                INSERT INTO issuer (stock_issue_id, free_float_id, name)
                VALUES (?, ?, ?)
                ON CONFLICT(stock_issue_id, free_float_id) DO UPDATE SET
                    name = excluded.name
                """,
                (stock_issue_id, free_float_id, name),
            )
            connection.commit()
        except sqlite3.Error as e:
            raise DatabaseManagerError(
                f"Failed to upsert issuer for stock_issue_id={stock_issue_id}: {str(e)}"
            ) from e

    def upsert_stock_issue_daily(
        self,
        stock_issue_id: int,
        free_float_id: int,
        total_shares: int,
        free_float: int,
        shareholders: int,
    ) -> None:
        """Upsert daily free-float metrics for a stock issue on a PDF date."""
        connection = self._require_connection()

        try:
            cursor = connection.cursor()
            cursor.execute(
                """
                INSERT INTO stock_issue_daily (
                    stock_issue_id, free_float_id,
                    total_shares, free_float, shareholders
                ) VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(stock_issue_id, free_float_id) DO UPDATE SET
                    total_shares = excluded.total_shares,
                    free_float = excluded.free_float,
                    shareholders = excluded.shareholders
                """,
                (
                    stock_issue_id,
                    free_float_id,
                    total_shares,
                    free_float,
                    shareholders,
                ),
            )
            connection.commit()
        except sqlite3.Error as e:
            raise DatabaseManagerError(
                f"Failed to upsert stock_issue_daily for "
                f"stock_issue_id={stock_issue_id}: {str(e)}"
            ) from e

    def save_extracted_rows(self, free_float_id: int, rows: List[Dict[str, Any]]) -> None:
        """
        Persist extracted PDF rows for one free_float date in a transaction.

        Each row dict must include: isin, issuer_name, total_shares,
        free_float, shareholders.
        """
        connection = self._require_connection()

        try:
            cursor = connection.cursor()
            for row in rows:
                isin = row["isin"]
                cursor.execute("SELECT id FROM stock_issue WHERE isin = ?", (isin,))
                existing = cursor.fetchone()
                if existing:
                    stock_issue_id = int(existing["id"])
                else:
                    cursor.execute("INSERT INTO stock_issue (isin) VALUES (?)", (isin,))
                    stock_issue_id = int(cursor.lastrowid)

                cursor.execute(
                    """
                    INSERT INTO issuer (stock_issue_id, free_float_id, name)
                    VALUES (?, ?, ?)
                    ON CONFLICT(stock_issue_id, free_float_id) DO UPDATE SET
                        name = excluded.name
                    """,
                    (stock_issue_id, free_float_id, row["issuer_name"]),
                )
                cursor.execute(
                    """
                    INSERT INTO stock_issue_daily (
                        stock_issue_id, free_float_id,
                        total_shares, free_float, shareholders
                    ) VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT(stock_issue_id, free_float_id) DO UPDATE SET
                        total_shares = excluded.total_shares,
                        free_float = excluded.free_float,
                        shareholders = excluded.shareholders
                    """,
                    (
                        stock_issue_id,
                        free_float_id,
                        row["total_shares"],
                        row["free_float"],
                        row["shareholders"],
                    ),
                )
            connection.commit()
        except sqlite3.Error as e:
            connection.rollback()
            raise DatabaseManagerError(
                f"Failed to save extracted rows for free_float_id=" f"{free_float_id}: {str(e)}"
            ) from e

    def mark_pdf_extracted(self, free_float_id: int, attempts: int = 1) -> None:
        """Mark a downloaded PDF as successfully extracted."""
        connection = self._require_connection()

        try:
            cursor = connection.cursor()
            cursor.execute(
                """
                UPDATE pdf_content
                SET extract_status = 'extracted',
                    extract_attempts = ?,
                    extract_last_error = NULL,
                    extracted_at = CURRENT_TIMESTAMP,
                    extract_failed_at = NULL,
                    updated_at = CURRENT_TIMESTAMP
                WHERE free_float_id = ?
                """,
                (attempts, free_float_id),
            )
            connection.commit()
        except sqlite3.Error as e:
            raise DatabaseManagerError(
                f"Failed to mark PDF extracted for id {free_float_id}: {str(e)}"
            ) from e

    def mark_pdf_extract_failed(self, free_float_id: int, attempts: int, last_error: str) -> None:
        """Mark a PDF extraction as failed until cleared."""
        connection = self._require_connection()

        try:
            cursor = connection.cursor()
            cursor.execute(
                """
                UPDATE pdf_content
                SET extract_status = 'failed',
                    extract_attempts = ?,
                    extract_last_error = ?,
                    extract_failed_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
                WHERE free_float_id = ?
                """,
                (attempts, last_error, free_float_id),
            )
            connection.commit()
            logger.warning(
                "Marked PDF extract failed for free_float_id=%s: %s",
                free_float_id,
                last_error,
            )
        except sqlite3.Error as e:
            raise DatabaseManagerError(
                f"Failed to mark PDF extract failed for id {free_float_id}: {str(e)}"
            ) from e

    def clear_failed_pdf_extractions(self, free_float_id: Optional[int] = None) -> int:
        """
        Clear failed extract marks so PDFs become pending again.

        Returns:
            Number of rows updated
        """
        connection = self._require_connection()

        try:
            cursor = connection.cursor()
            if free_float_id is None:
                cursor.execute(
                    """
                    UPDATE pdf_content
                    SET extract_status = NULL,
                        extract_attempts = 0,
                        extract_last_error = NULL,
                        extract_failed_at = NULL,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE extract_status = 'failed'
                    """
                )
            else:
                cursor.execute(
                    """
                    UPDATE pdf_content
                    SET extract_status = NULL,
                        extract_attempts = 0,
                        extract_last_error = NULL,
                        extract_failed_at = NULL,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE extract_status = 'failed' AND free_float_id = ?
                    """,
                    (free_float_id,),
                )
            connection.commit()
            updated = cursor.rowcount if cursor.rowcount is not None else 0
            logger.info("Cleared %s failed PDF extract mark(s)", updated)
            return updated
        except sqlite3.Error as e:
            raise DatabaseManagerError(f"Failed to clear failed PDF extractions: {str(e)}") from e
