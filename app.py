#!/usr/bin/env python3
"""
CSD-BG Free Float Scraper

This application scrapes Free Float PDF links from the CSD-BG website,
stores them in an SQLite database, and exports them to a CSV file.
"""

import argparse
import logging
import sys
from typing import List, Dict

from src.web_scraper import WebScraper, WebScraperError
from src.database_manager import DatabaseManager, DatabaseManagerError
from src.csv_manager import CSVManager, CSVManagerError


# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler('app.log')
    ]
)

logger = logging.getLogger(__name__)


class FreeFloatScraperApp:
    """
    Main application class for CSD-BG Free Float scraper.
    
    Orchestrates the workflow of scraping, storing, and exporting
    Free Float PDF links.
    """

    def __init__(self, csv_path: str, db_path: str, timeout: int = 30, 
                 use_post_pagination: bool = True, max_pages: int = None,
                 enable_early_stopping: bool = True, early_stopping_threshold: int = 10):
        """
        Initialize the application.
        
        Smart defaults for incremental updates:
        - Pagination enabled: Scrapes all pages until duplicates found
        - Early stopping enabled: Stops after 10 consecutive duplicates
        
        Args:
            csv_path: Path to the CSV file for exporting data
            db_path: Path to the SQLite database
            timeout: HTTP request timeout in seconds (default: 30)
            use_post_pagination: Use POST-based pagination (default: True)
            max_pages: Maximum number of pages to scrape when using pagination (default: None for all)
            enable_early_stopping: Stop processing when consecutive duplicates found (default: True)
            early_stopping_threshold: Number of consecutive duplicates before stopping (default: 10)
        """
        self.csv_path = csv_path
        self.db_path = db_path
        self.timeout = timeout
        self.use_post_pagination = use_post_pagination
        self.max_pages = max_pages
        self.enable_early_stopping = enable_early_stopping
        self.early_stopping_threshold = early_stopping_threshold
        
        self.scraper = WebScraper(timeout=timeout)
        self.db_manager = DatabaseManager(db_path)
        self.csv_manager = CSVManager(csv_path)
        
        self.new_records_count = 0
        self.skipped_records_count = 0

    def setup(self) -> None:
        """
        Set up the application by initializing database and CSV file.
        
        Raises:
            DatabaseManagerError: If database setup fails
            CSVManagerError: If CSV setup fails
        """
        logger.info("Setting up application...")
        
        # Initialize database
        with self.db_manager:
            self.db_manager.initialize_table()
        
        # Initialize CSV file
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
        logger.info(f"Processing {len(links)} links...")
        
        consecutive_duplicates = 0
        
        with self.db_manager:
            # Check if database is empty - disable early stopping for initial import
            database_was_empty = False
            if self.db_manager._connection is not None:
                cursor = self.db_manager._connection.cursor()
                cursor.execute("SELECT COUNT(*) FROM free_float")
                record_count = cursor.fetchone()[0]
                database_was_empty = (record_count == 0)
                
                if database_was_empty and self.enable_early_stopping:
                    logger.info("Database is empty - early stopping disabled for initial import")
            
            for index, link in enumerate(links):
                date = link['date']
                url = link['url']
                
                # Check if record already exists
                if self.db_manager.record_exists(date):
                    logger.info(f"Skipping existing record for date: {date}")
                    self.skipped_records_count += 1
                    consecutive_duplicates += 1
                    
                    # Early stopping optimization (disabled if database was initially empty)
                    if (self.enable_early_stopping and 
                        not database_was_empty and
                        consecutive_duplicates >= self.early_stopping_threshold):
                        remaining = len(links) - index - 1
                        logger.info(
                            f"Early stopping triggered: {consecutive_duplicates} consecutive "
                            f"duplicates found. Skipping {remaining} remaining links."
                        )
                        break
                    
                    continue
                
                # Reset consecutive duplicates counter when new record found
                consecutive_duplicates = 0
                
                # Insert into database
                inserted = self.db_manager.insert_record(date, url)
                
                if inserted:
                    # Append to CSV
                    self.csv_manager.append_record(date, url)
                    logger.info(f"Added new record: date={date}, url={url}")
                    self.new_records_count += 1
                else:
                    logger.warning(f"Failed to insert record for date: {date}")
                    self.skipped_records_count += 1

    def run(self) -> int:
        """
        Run the complete scraping and processing workflow.
        
        Returns:
            Exit code (0 for success, 1 for failure)
        """
        try:
            logger.info("Starting CSD-BG Free Float Scraper...")
            logger.info(f"CSV Path: {self.csv_path}")
            logger.info(f"Database Path: {self.db_path}")
            
            # Setup
            self.setup()
            
            # Scrape links
            if self.use_post_pagination:
                logger.info("Scraping Free Float links from CSD-BG website using POST pagination...")
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
            
            # Process links
            self.process_links(links)
            
            # Summary
            logger.info("=" * 50)
            logger.info("Processing Summary:")
            logger.info(f"  Total links found: {len(links)}")
            logger.info(f"  New records added: {self.new_records_count}")
            logger.info(f"  Records skipped (already exist): {self.skipped_records_count}")
            logger.info("=" * 50)
            
            logger.info("Application completed successfully")
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
            logger.error(f"Unexpected error: {str(e)}", exc_info=True)
            return 1


def parse_arguments() -> argparse.Namespace:
    """
    Parse command-line arguments.
    
    Returns:
        Parsed arguments namespace
    """
    parser = argparse.ArgumentParser(
        description='CSD-BG Free Float Scraper - Extract and store Free Float PDF links',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Default: Incremental update (pagination + early stopping)
  %(prog)s --csv /data/free_float.csv --db /data/free_float.db
  
  # Scrape first page only (disable pagination)
  %(prog)s --csv ./output.csv --db ./database.db --no-pagination
  
  # Scrape first 5 pages with early stopping
  %(prog)s --csv ./output.csv --db ./database.db --max-pages 5
  
  # Check all records without early stopping (initial import)
  %(prog)s --csv ./output.csv --db ./database.db --no-early-stopping
  
  # Custom early stopping threshold (stop after 5 consecutive duplicates)
  %(prog)s --csv ./output.csv --db ./database.db --early-stopping-threshold 5
  
  # With custom timeout
  %(prog)s --csv ./output.csv --db ./database.db --timeout 60
        """
    )
    
    parser.add_argument(
        '--csv',
        type=str,
        required=True,
        help='Path to the CSV file for exporting data'
    )
    
    parser.add_argument(
        '--db',
        type=str,
        required=True,
        help='Path to the SQLite database file'
    )
    
    parser.add_argument(
        '--timeout',
        type=int,
        default=30,
        help='HTTP request timeout in seconds (default: 30)'
    )
    
    parser.add_argument(
        '--no-pagination',
        action='store_true',
        help='Disable pagination and scrape only first page (default: pagination enabled)'
    )
    
    parser.add_argument(
        '--max-pages',
        type=int,
        default=None,
        help='Maximum number of pages to scrape when using --pagination (default: all pages)'
    )
    
    parser.add_argument(
        '--no-early-stopping',
        action='store_true',
        help='Disable early stopping and check all records (default: early stopping enabled)'
    )
    
    parser.add_argument(
        '--early-stopping-threshold',
        type=int,
        default=10,
        help='Number of consecutive duplicates before early stopping (default: 10, requires --early-stopping)'
    )
    
    parser.add_argument(
        '--version',
        action='version',
        version='%(prog)s 1.0.0'
    )
    
    return parser.parse_args()


def main() -> int:
    """
    Main entry point for the application.
    
    Returns:
        Exit code
    """
    args = parse_arguments()
    
    app = FreeFloatScraperApp(
        csv_path=args.csv,
        db_path=args.db,
        timeout=args.timeout,
        use_post_pagination=not args.no_pagination,  # Inverted logic
        max_pages=args.max_pages,
        enable_early_stopping=not args.no_early_stopping,  # Inverted logic
        early_stopping_threshold=args.early_stopping_threshold
    )
    
    return app.run()


if __name__ == '__main__':
    sys.exit(main())
