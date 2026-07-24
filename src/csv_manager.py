"""CSV manager module for handling CSV file operations."""

import csv
from pathlib import Path
from typing import List, Dict
import logging


logger = logging.getLogger(__name__)


class CSVManagerError(Exception):
    """Custom exception for CSV operations."""
    pass


class CSVManager:
    """
    Manager for CSV file operations.
    
    Handles appending records to a CSV file containing Free Float data.
    """

    FIELDNAMES = ['date', 'url']

    def __init__(self, csv_path: str):
        """
        Initialize the CSVManager.
        
        Args:
            csv_path: Path to the CSV file
        """
        self.csv_path = Path(csv_path)
        self._ensure_csv_directory()

    def _ensure_csv_directory(self) -> None:
        """Ensure the CSV file directory exists."""
        self.csv_path.parent.mkdir(parents=True, exist_ok=True)

    def _file_exists_and_has_content(self) -> bool:
        """Check if CSV file exists and has content."""
        return self.csv_path.exists() and self.csv_path.stat().st_size > 0

    def initialize_file(self) -> None:
        """
        Initialize the CSV file with headers if it doesn't exist.
        
        Creates a new CSV file with 'date' and 'url' headers.
        
        Raises:
            CSVManagerError: If file creation fails
        """
        try:
            if not self._file_exists_and_has_content():
                with open(self.csv_path, 'w', newline='', encoding='utf-8') as csvfile:
                    writer = csv.DictWriter(csvfile, fieldnames=self.FIELDNAMES)
                    writer.writeheader()
                    logger.info(f"Initialized CSV file: {self.csv_path}")
            else:
                logger.info(f"CSV file already exists: {self.csv_path}")
        except IOError as e:
            raise CSVManagerError(f"Failed to initialize CSV file: {str(e)}") from e

    def append_record(self, date: str, url: str) -> None:
        """
        Append a new record to the CSV file.
        
        Args:
            date: Date string in YYYY-MM-DD format
            url: Full URL to the PDF file
            
        Raises:
            CSVManagerError: If append operation fails
        """
        try:
            # Ensure file exists with headers
            self.initialize_file()

            # Append the record
            with open(self.csv_path, 'a', newline='', encoding='utf-8') as csvfile:
                writer = csv.DictWriter(csvfile, fieldnames=self.FIELDNAMES)
                writer.writerow({'date': date, 'url': url})
                logger.info(f"Appended to CSV: date={date}, url={url}")
        except IOError as e:
            raise CSVManagerError(f"Failed to append record to CSV: {str(e)}") from e

    def read_all_records(self) -> List[Dict[str, str]]:
        """
        Read all records from the CSV file.
        
        Returns:
            List of dictionaries containing record data
            
        Raises:
            CSVManagerError: If read operation fails
        """
        if not self.csv_path.exists():
            return []

        try:
            with open(self.csv_path, 'r', newline='', encoding='utf-8') as csvfile:
                reader = csv.DictReader(csvfile)
                return list(reader)
        except IOError as e:
            raise CSVManagerError(f"Failed to read CSV file: {str(e)}") from e

    def get_record_count(self) -> int:
        """
        Get the number of records in the CSV file (excluding header).
        
        Returns:
            Number of records
        """
        records = self.read_all_records()
        return len(records)
