#!/usr/bin/env python3
"""
Example: Using POST-based pagination

This example demonstrates how to use the POST-based pagination feature
to extract Free Float links from multiple pages.
"""

from src.web_scraper import WebScraper, WebScraperError


def example_basic_pagination():
    """Example 1: Basic pagination - scrape first 3 pages."""
    print("=" * 60)
    print("Example 1: Basic Pagination (3 pages)")
    print("=" * 60)
    
    scraper = WebScraper(timeout=30)
    
    try:
        # Scrape first 3 pages
        links = scraper.scrape_with_post_pagination(max_pages=3)
        
        print(f"\n✓ Successfully scraped {len(links)} links from 3 pages\n")
        
        # Display first 5 links
        print("First 5 links:")
        for i, link in enumerate(links[:5], 1):
            print(f"  {i}. {link['date']}: {link['url']}")
        
        print(f"\n... and {len(links) - 5} more links\n")
        
    except WebScraperError as e:
        print(f"Error: {e}")


def example_all_pages():
    """Example 2: Scrape all available pages."""
    print("=" * 60)
    print("Example 2: Scrape All Pages")
    print("=" * 60)
    print("\nNote: This may take 2-3 minutes...")
    print("Press Ctrl+C to cancel\n")
    
    scraper = WebScraper(timeout=30)
    
    try:
        # Scrape all pages (no max_pages limit)
        links = scraper.scrape_with_post_pagination()
        
        print(f"\n✓ Successfully scraped {len(links)} total links\n")
        
        # Analyze dates
        if links:
            dates = [link['date'] for link in links]
            print(f"Date range: {min(dates)} to {max(dates)}")
            print(f"Total unique dates: {len(set(dates))}\n")
        
    except WebScraperError as e:
        print(f"Error: {e}")
    except KeyboardInterrupt:
        print("\n\nScraping cancelled by user")


def example_with_filtering():
    """Example 3: Scrape and filter by date."""
    print("=" * 60)
    print("Example 3: Scrape with Date Filtering")
    print("=" * 60)
    
    scraper = WebScraper(timeout=30)
    
    try:
        # Scrape first 10 pages
        links = scraper.scrape_with_post_pagination(max_pages=10)
        
        print(f"\n✓ Scraped {len(links)} links from 10 pages\n")
        
        # Filter for December 2025 links
        december_links = [
            link for link in links 
            if link['date'].startswith('2025-12')
        ]
        
        print(f"Links from December 2025: {len(december_links)}")
        
        if december_links:
            print("\nDecember 2025 links:")
            for link in december_links[:5]:
                print(f"  - {link['date']}: {link['url']}")
            
            if len(december_links) > 5:
                print(f"  ... and {len(december_links) - 5} more")
        
        print()
        
    except WebScraperError as e:
        print(f"Error: {e}")


def example_comparison():
    """Example 4: Compare single page vs pagination."""
    print("=" * 60)
    print("Example 4: Single Page vs Pagination Comparison")
    print("=" * 60)
    
    scraper = WebScraper(timeout=30)
    
    try:
        # Single page scraping
        print("\nFetching first page only...")
        single_page_links = scraper.scrape()
        print(f"✓ Single page: {len(single_page_links)} links")
        
        # Paginated scraping (5 pages)
        print("\nFetching 5 pages with pagination...")
        paginated_links = scraper.scrape_with_post_pagination(max_pages=5)
        print(f"✓ Pagination (5 pages): {len(paginated_links)} links")
        
        print(f"\n📊 Pagination gave you {len(paginated_links) - len(single_page_links)} more links!")
        print(f"   ({len(paginated_links) / len(single_page_links) if single_page_links else 0:.1f}x more data)\n")
        
    except WebScraperError as e:
        print(f"Error: {e}")


def main():
    """Run all examples."""
    print("\n")
    print("╔" + "=" * 58 + "╗")
    print("║" + " " * 10 + "POST-Based Pagination Examples" + " " * 17 + "║")
    print("╚" + "=" * 58 + "╝")
    print()
    
    # Run examples
    # Comment out examples you don't want to run
    
    example_basic_pagination()
    print("\n" * 2)
    
    example_comparison()
    print("\n" * 2)
    
    example_with_filtering()
    print("\n" * 2)
    
    # Uncomment to run the full scrape (takes 2-3 minutes)
    # example_all_pages()
    # print("\n" * 2)
    
    print("=" * 60)
    print("Examples completed!")
    print("=" * 60)
    print()


if __name__ == '__main__':
    main()
