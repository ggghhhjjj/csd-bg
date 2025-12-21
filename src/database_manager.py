"""Database manager module for SQLite operations."""

import sqlite3
from typing import Optional, List, Dict
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
    for Free Float records.
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

    def initialize_table(self) -> None:
        """
        Create the free_float table if it doesn't exist.
        
        Table schema:
            - id: INTEGER PRIMARY KEY AUTOINCREMENT
            - date: TEXT NOT NULL UNIQUE (format: YYYY-MM-DD)
            - url: TEXT NOT NULL
            - created_at: TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            
        Raises:
            DatabaseManagerError: If table creation fails
        """
        if not self._connection:
            raise DatabaseManagerError("Not connected to database")

        try:
            cursor = self._connection.cursor()
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS free_float (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    date TEXT NOT NULL UNIQUE,
                    url TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            self._connection.commit()
            logger.info("Table 'free_float' initialized")
        except sqlite3.Error as e:
            raise DatabaseManagerError(f"Failed to initialize table: {str(e)}") from e

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
        if not self._connection:
            raise DatabaseManagerError("Not connected to database")

        try:
            cursor = self._connection.cursor()
            cursor.execute("SELECT 1 FROM free_float WHERE date = ?", (date,))
            result = cursor.fetchone()
            return result is not None
        except sqlite3.Error as e:
            raise DatabaseManagerError(f"Failed to check record existence: {str(e)}") from e

    def insert_record(self, date: str, url: str) -> bool:
        """
        Insert a new record into the database.
        
        Args:
            date: Date string in YYYY-MM-DD format
            url: Full URL to the PDF file
            
        Returns:
            True if insertion was successful, False if record already exists
            
        Raises:
            DatabaseManagerError: If insertion fails
        """
        if not self._connection:
            raise DatabaseManagerError("Not connected to database")

        # Check if record already exists
        if self.record_exists(date):
            logger.info(f"Record for date {date} already exists")
            return False

        try:
            cursor = self._connection.cursor()
            cursor.execute(
                "INSERT INTO free_float (date, url) VALUES (?, ?)",
                (date, url)
            )
            self._connection.commit()
            logger.info(f"Inserted record: date={date}, url={url}")
            return True
        except sqlite3.IntegrityError:
            # Record already exists (race condition)
            logger.warning(f"Record for date {date} already exists (race condition)")
            return False
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
        if not self._connection:
            raise DatabaseManagerError("Not connected to database")

        try:
            cursor = self._connection.cursor()
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
        if not self._connection:
            raise DatabaseManagerError("Not connected to database")

        try:
            cursor = self._connection.cursor()
            cursor.execute("SELECT COUNT(*) as count FROM free_float")
            result = cursor.fetchone()
            return result['count'] if result else 0
        except sqlite3.Error as e:
            raise DatabaseManagerError(f"Failed to count records: {str(e)}") from e
