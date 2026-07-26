#!/usr/bin/env python3
"""
CSD-BG Free Float Scraper

This application scrapes Free Float PDF links from the CSD-BG website,
stores them in an SQLite database, exports them to a CSV file, and can
download PDF contents into the database via a step-based pipeline.
"""

import argparse
import logging
import sys
from pathlib import Path
from typing import List, Dict, Optional

from src.web_scraper import WebScraper, WebScraperError
from src.database_manager import DatabaseManager, DatabaseManagerError
from src.csv_manager import CSVManager, CSVManagerError
from src.pdf_downloader import PdfDownloader, PdfDownloaderError
from src.pdf_extractor import PdfExtractor, PdfExtractorError
from src.pipeline import parse_steps, run_pipeline, PipelineError, KNOWN_STEPS


LOG_FORMAT = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
DEFAULT_LOG_PATH = "/data/app.log"

# Stdout logging at import time; file handler is attached in main() from --log
logging.basicConfig(
    level=logging.INFO,
    format=LOG_FORMAT,
    handlers=[logging.StreamHandler(sys.stdout)],
)

logger = logging.getLogger(__name__)


def configure_file_logging(log_path: str) -> None:
    """
    Attach a file handler for the given log path.

    Creates the parent directory when needed. On failure, keeps stdout logging only.
    """
    path = Path(log_path)
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        abs_path = str(path.resolve())
        root = logging.getLogger()
        for handler in root.handlers:
            if (
                isinstance(handler, logging.FileHandler)
                and getattr(handler, "baseFilename", None) == abs_path
            ):
                return
        file_handler = logging.FileHandler(path)
        file_handler.setFormatter(logging.Formatter(LOG_FORMAT))
        root.addHandler(file_handler)
    except OSError as e:
        logger.warning("Could not open log file %s: %s", log_path, e)


class FreeFloatScraperApp:
    """
    Main application class for CSD-BG Free Float scraper.

    Orchestrates pipeline steps: scrape (link discovery) and download (PDF BLOBs).
    """

    def __init__(
        self,
        csv_path: Optional[str],
        db_path: str,
        timeout: int = 30,
        use_post_pagination: bool = True,
        max_pages: Optional[int] = None,
        enable_early_stopping: bool = True,
        early_stopping_threshold: int = 10,
        download_retries: int = 3,
        download_retry_min: int = 10,
        download_retry_max: int = 30,
        clear_failed_downloads: bool = False,
        clear_failed_extracts: bool = False,
    ):
        """
        Initialize the application.

        Smart defaults for incremental updates:
        - Pagination enabled: Scrapes all pages until duplicates found
        - Early stopping enabled: Stops after 10 consecutive duplicates

        Args:
            csv_path: Path to the CSV file for exporting data (required for scrape)
            db_path: Path to the SQLite database
            timeout: HTTP request timeout in seconds (default: 30)
            use_post_pagination: Use POST-based pagination (default: True)
            max_pages: Maximum pages to scrape when using pagination (default: None)
            enable_early_stopping: Stop after consecutive duplicates (default: True)
            early_stopping_threshold: Consecutive duplicates before stopping (default: 10)
            download_retries: Max PDF download attempts per URL (default: 3)
            download_retry_min: Min backoff seconds between download attempts
            download_retry_max: Max backoff seconds between download attempts
            clear_failed_downloads: Clear failed PDF marks before download step
            clear_failed_extracts: Clear failed extract marks before extract step
        """
        self.csv_path = csv_path
        self.db_path = db_path
        self.timeout = timeout
        self.use_post_pagination = use_post_pagination
        self.max_pages = max_pages
        self.enable_early_stopping = enable_early_stopping
        self.early_stopping_threshold = early_stopping_threshold
        self.download_retries = download_retries
        self.download_retry_min = download_retry_min
        self.download_retry_max = download_retry_max
        self.clear_failed_downloads = clear_failed_downloads
        self.clear_failed_extracts = clear_failed_extracts

        self.scraper = WebScraper(timeout=timeout)
        self.db_manager = DatabaseManager(db_path)
        self.csv_manager = CSVManager(csv_path) if csv_path else None
        self.pdf_downloader = PdfDownloader(
            timeout=timeout,
            max_retries=download_retries,
            retry_min_seconds=download_retry_min,
            retry_max_seconds=download_retry_max,
        )
        self.pdf_extractor = PdfExtractor()

        self.new_records_count = 0
        self.skipped_records_count = 0
        self.downloaded_count = 0
        self.download_failed_count = 0
        self.extracted_count = 0
        self.extract_failed_count = 0
        self.extract_rows_count = 0

    def setup(self, include_csv: bool = True) -> None:
        """
        Set up the application by initializing database and optionally CSV.

        Args:
            include_csv: Initialize CSV file when True

        Raises:
            DatabaseManagerError: If database setup fails
            CSVManagerError: If CSV setup fails
        """
        logger.info("Setting up application...")

        with self.db_manager:
            self.db_manager.initialize_tables()

        if include_csv:
            if self.csv_manager is None:
                raise CSVManagerError("CSV path is required for the scrape step")
            self.csv_manager.initialize_file()

        logger.info("Application setup completed")

    def process_links(self, links: List[Dict[str, str]]) -> None:
        """
        Process extracted links: check database and insert new records.

        With early stopping enabled, processing stops after finding N consecutive
        duplicate records (indicating all remaining records likely already exist).
        Note: Early stopping is automatically disabled if database is empty.

        Args:
            links: List of link dictionaries containing 'date' and 'url'

        Raises:
            DatabaseManagerError: If database operations fail
            CSVManagerError: If CSV operations fail
        """
        if self.csv_manager is None:
            raise CSVManagerError("CSV path is required for the scrape step")

        logger.info(f"Processing {len(links)} links...")

        consecutive_duplicates = 0

        with self.db_manager:
            # Check if database is empty - disable early stopping for initial import
            database_was_empty = False
            if self.db_manager._connection is not None:
                cursor = self.db_manager._connection.cursor()
                cursor.execute("SELECT COUNT(*) FROM free_float")
                record_count = cursor.fetchone()[0]
                database_was_empty = record_count == 0

                if database_was_empty and self.enable_early_stopping:
                    logger.info("Database is empty - early stopping disabled for initial import")

            for index, link in enumerate(links):
                date = link["date"]
                url = link["url"]

                if self.db_manager.record_exists(date):
                    logger.info(f"Skipping existing record for date: {date}")
                    self.skipped_records_count += 1
                    consecutive_duplicates += 1

                    if (
                        self.enable_early_stopping
                        and not database_was_empty
                        and consecutive_duplicates >= self.early_stopping_threshold
                    ):
                        remaining = len(links) - index - 1
                        logger.info(
                            f"Early stopping triggered: {consecutive_duplicates} consecutive "
                            f"duplicates found. Skipping {remaining} remaining links."
                        )
                        break

                    continue

                consecutive_duplicates = 0

                inserted_id = self.db_manager.insert_record(date, url)

                if inserted_id is not None:
                    self.csv_manager.append_record(date, url)
                    logger.info(f"Added new record: date={date}, url={url}")
                    self.new_records_count += 1
                else:
                    logger.warning(f"Failed to insert record for date: {date}")
                    self.skipped_records_count += 1

    def run_scrape(self) -> int:
        """
        Run the scrape step: discover PDF links and persist metadata.

        Returns:
            Exit code (0 for success, 1 for failure)
        """
        try:
            logger.info("Starting scrape step...")
            logger.info(f"CSV Path: {self.csv_path}")
            logger.info(f"Database Path: {self.db_path}")

            self.setup(include_csv=True)

            if self.use_post_pagination:
                logger.info(
                    "Scraping Free Float links from CSD-BG website using POST pagination..."
                )
                if self.max_pages:
                    logger.info(f"Limiting to {self.max_pages} pages")
                else:
                    logger.info("Scraping all available pages")
                links = self.scraper.scrape_with_post_pagination(max_pages=self.max_pages)
            else:
                logger.info("Scraping Free Float links from CSD-BG website (first page only)...")
                links = self.scraper.scrape()
            logger.info(f"Found {len(links)} Free Float links")

            if not links:
                logger.warning("No Free Float links found")
                return 0

            self.process_links(links)

            logger.info("=" * 50)
            logger.info("Scrape Summary:")
            logger.info(f"  Total links found: {len(links)}")
            logger.info(f"  New records added: {self.new_records_count}")
            logger.info(f"  Records skipped (already exist): {self.skipped_records_count}")
            logger.info("=" * 50)
            logger.info("Scrape step completed successfully")
            return 0

        except WebScraperError as e:
            logger.error(f"Web scraping error: {str(e)}")
            return 1
        except DatabaseManagerError as e:
            logger.error(f"Database error: {str(e)}")
            return 1
        except CSVManagerError as e:
            logger.error(f"CSV error: {str(e)}")
            return 1
        except Exception as e:
            logger.error(f"Unexpected error during scrape: {str(e)}", exc_info=True)
            return 1

    def run_download(self) -> int:
        """
        Run the download step: fetch pending PDFs into pdf_content.

        Returns:
            Exit code (0 for success, 1 for failure)
        """
        try:
            logger.info("Starting download step...")
            logger.info(f"Database Path: {self.db_path}")

            self.setup(include_csv=False)

            with self.db_manager:
                if self.clear_failed_downloads:
                    cleared = self.db_manager.clear_failed_pdf_downloads()
                    logger.info(f"Cleared {cleared} failed PDF download mark(s)")

                pending = self.db_manager.get_pending_pdf_downloads()
                logger.info(f"Pending PDF downloads: {len(pending)}")

                for record in pending:
                    free_float_id = record["id"]
                    date = record["date"]
                    url = record["url"]
                    try:
                        content = self.pdf_downloader.download(url)
                        self.db_manager.upsert_pdf_downloaded(
                            free_float_id=free_float_id,
                            content=content,
                            size_bytes=len(content),
                            attempts=self.pdf_downloader.last_attempts,
                        )
                        self.downloaded_count += 1
                        logger.info(
                            "Stored PDF for date=%s free_float_id=%s (%s bytes)",
                            date,
                            free_float_id,
                            len(content),
                        )
                    except PdfDownloaderError as e:
                        self.db_manager.mark_pdf_failed(
                            free_float_id=free_float_id,
                            attempts=self.pdf_downloader.last_attempts
                            or self.pdf_downloader.max_retries,
                            last_error=str(e),
                        )
                        self.download_failed_count += 1
                        logger.error(
                            "Failed PDF download for date=%s free_float_id=%s: %s",
                            date,
                            free_float_id,
                            e,
                        )

            logger.info("=" * 50)
            logger.info("Download Summary:")
            logger.info(f"  Downloaded: {self.downloaded_count}")
            logger.info(f"  Failed (marked): {self.download_failed_count}")
            logger.info("=" * 50)
            logger.info("Download step completed successfully")
            return 0

        except DatabaseManagerError as e:
            logger.error(f"Database error: {str(e)}")
            return 1
        except Exception as e:
            logger.error(f"Unexpected error during download: {str(e)}", exc_info=True)
            return 1

    def run_extract(self) -> int:
        """
        Run the extract step: parse pending PDF BLOBs into stock tables.

        Returns:
            Exit code (0 for success, 1 for failure)
        """
        try:
            logger.info("Starting extract step...")
            logger.info(f"Database Path: {self.db_path}")

            self.setup(include_csv=False)

            with self.db_manager:
                if self.clear_failed_extracts:
                    cleared = self.db_manager.clear_failed_pdf_extractions()
                    logger.info(f"Cleared {cleared} failed PDF extract mark(s)")

                pending = self.db_manager.get_pending_pdf_extractions()
                logger.info(f"Pending PDF extractions: {len(pending)}")

                for record in pending:
                    free_float_id = record["free_float_id"]
                    date = record["date"]
                    content = record["content"]
                    if isinstance(content, memoryview):
                        content = content.tobytes()
                    elif not isinstance(content, (bytes, bytearray)):
                        content = bytes(content)

                    try:
                        rows = self.pdf_extractor.extract(content)
                        self.db_manager.save_extracted_rows(free_float_id, rows)
                        self.db_manager.mark_pdf_extracted(free_float_id, attempts=1)
                        self.extracted_count += 1
                        self.extract_rows_count += len(rows)
                        logger.info(
                            "Extracted %s rows for date=%s free_float_id=%s",
                            len(rows),
                            date,
                            free_float_id,
                        )
                    except PdfExtractorError as e:
                        self.db_manager.mark_pdf_extract_failed(
                            free_float_id=free_float_id,
                            attempts=1,
                            last_error=str(e),
                        )
                        self.extract_failed_count += 1
                        logger.error(
                            "Failed PDF extract for date=%s free_float_id=%s: %s",
                            date,
                            free_float_id,
                            e,
                        )

            logger.info("=" * 50)
            logger.info("Extract Summary:")
            logger.info(f"  PDFs extracted: {self.extracted_count}")
            logger.info(f"  PDFs failed: {self.extract_failed_count}")
            logger.info(f"  Rows written: {self.extract_rows_count}")
            logger.info("=" * 50)
            logger.info("Extract step completed successfully")
            return 0

        except DatabaseManagerError as e:
            logger.error(f"Database error: {str(e)}")
            return 1
        except Exception as e:
            logger.error(f"Unexpected error during extract: {str(e)}", exc_info=True)
            return 1

    def run(self, steps: Optional[List[str]] = None) -> int:
        """
        Run the selected pipeline steps in order.

        Args:
            steps: Ordered step names; defaults to scrape only for backward compatibility

        Returns:
            Exit code (0 for success, 1 for failure)
        """
        selected_steps = steps if steps is not None else ["scrape"]
        logger.info("Starting CSD-BG Free Float pipeline: %s", ",".join(selected_steps))

        try:
            return run_pipeline(
                selected_steps,
                {
                    "scrape": self.run_scrape,
                    "download": self.run_download,
                    "extract": self.run_extract,
                },
            )
        except PipelineError as e:
            logger.error(f"Pipeline error: {str(e)}")
            return 1


def parse_arguments(argv: Optional[List[str]] = None) -> argparse.Namespace:
    """
    Parse command-line arguments.

    Args:
        argv: Optional argument list (defaults to sys.argv[1:])

    Returns:
        Parsed arguments namespace
    """
    parser = argparse.ArgumentParser(
        description=("CSD-BG Free Float pipeline - scrape, download, and extract PDF content"),
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=f"""
Examples:
  # Full pipeline (typical Synology schedule)
  %(prog)s scrape,download,extract --csv /data/free_float.csv --db /data/free_float.db

  # Download only (catch up pending PDFs)
  %(prog)s download --db /data/free_float.db

  # Extract only
  %(prog)s extract --db /data/free_float.db

  # Clear failed extract marks, then retry
  %(prog)s extract --db /data/free_float.db --clear-failed-extracts

  # Clear failed download marks, then retry downloads
  %(prog)s download --db /data/free_float.db --clear-failed-downloads

Known steps: {', '.join(KNOWN_STEPS)}
        """,
    )

    parser.add_argument(
        "steps",
        nargs="?",
        default="scrape,download,extract",
        help=(
            "Comma-separated pipeline steps to run "
            f"(default: scrape,download,extract; known: {', '.join(KNOWN_STEPS)})"
        ),
    )

    parser.add_argument(
        "--csv",
        type=str,
        default=None,
        help="Path to the CSV file for exporting data (required for scrape)",
    )

    parser.add_argument(
        "--db",
        type=str,
        required=True,
        help="Path to the SQLite database file",
    )

    parser.add_argument(
        "--log",
        type=str,
        default=DEFAULT_LOG_PATH,
        help=f"Path to the application log file (default: {DEFAULT_LOG_PATH})",
    )

    parser.add_argument(
        "--timeout",
        type=int,
        default=30,
        help="HTTP request timeout in seconds (default: 30)",
    )

    parser.add_argument(
        "--no-pagination",
        action="store_true",
        help="Disable pagination and scrape only first page (default: pagination enabled)",
    )

    parser.add_argument(
        "--max-pages",
        type=int,
        default=None,
        help="Maximum number of pages to scrape when using pagination (default: all pages)",
    )

    parser.add_argument(
        "--no-early-stopping",
        action="store_true",
        help="Disable early stopping and check all records (default: early stopping enabled)",
    )

    parser.add_argument(
        "--early-stopping-threshold",
        type=int,
        default=10,
        help=("Number of consecutive duplicates before early stopping " "(default: 10)"),
    )

    parser.add_argument(
        "--download-retries",
        type=int,
        default=3,
        help="Maximum PDF download attempts per URL (default: 3)",
    )

    parser.add_argument(
        "--download-retry-min",
        type=int,
        default=10,
        help="Minimum seconds to wait between download retries (default: 10)",
    )

    parser.add_argument(
        "--download-retry-max",
        type=int,
        default=30,
        help="Maximum seconds to wait between download retries (default: 30)",
    )

    parser.add_argument(
        "--clear-failed-downloads",
        action="store_true",
        help="Clear failed PDF download marks before the download step",
    )

    parser.add_argument(
        "--clear-failed-extracts",
        action="store_true",
        help="Clear failed PDF extract marks before the extract step",
    )

    parser.add_argument(
        "--version",
        action="version",
        version="%(prog)s 1.2.0",
    )

    args = parser.parse_args(argv)

    try:
        args.parsed_steps = parse_steps(args.steps)
    except PipelineError as e:
        parser.error(str(e))

    if "scrape" in args.parsed_steps and not args.csv:
        parser.error("--csv is required when the scrape step is selected")

    if args.download_retries < 1:
        parser.error("--download-retries must be at least 1")

    if args.download_retry_min > args.download_retry_max:
        parser.error("--download-retry-min cannot exceed --download-retry-max")

    return args


def main(argv: Optional[List[str]] = None) -> int:
    """
    Main entry point for the application.

    Args:
        argv: Optional argument list for testing

    Returns:
        Exit code
    """
    args = parse_arguments(argv)
    configure_file_logging(args.log)

    app = FreeFloatScraperApp(
        csv_path=args.csv,
        db_path=args.db,
        timeout=args.timeout,
        use_post_pagination=not args.no_pagination,
        max_pages=args.max_pages,
        enable_early_stopping=not args.no_early_stopping,
        early_stopping_threshold=args.early_stopping_threshold,
        download_retries=args.download_retries,
        download_retry_min=args.download_retry_min,
        download_retry_max=args.download_retry_max,
        clear_failed_downloads=args.clear_failed_downloads,
        clear_failed_extracts=args.clear_failed_extracts,
    )

    return app.run(steps=args.parsed_steps)


if __name__ == "__main__":
    sys.exit(main())
