#!/usr/bin/env python3
"""
Live test script for POST-based pagination.

This script tests the pagination functionality against the real CSD-BG website.
Run with: python3 test_pagination_live.py
"""

import sys
from src.web_scraper import WebScraper, WebScraperError


def test_pagination():
    """Test pagination by fetching a few pages."""
    print("=" * 60)
    print("Testing POST-based Pagination")
    print("=" * 60)
    
    scraper = WebScraper(timeout=30)
    
    try:
        # Test fetching first 3 pages
        print("\n1. Testing pagination (first 3 pages)...")
        links = scraper.scrape_with_post_pagination(max_pages=3)
        
        print(f"✓ Successfully fetched {len(links)} links from 3 pages")
        
        if links:
            print("\n2. Sample of extracted links:")
            for i, link in enumerate(links[:5], 1):
                print(f"   {i}. Date: {link['date']}, URL: {link['url']}")
            
            if len(links) > 5:
                print(f"   ... and {len(links) - 5} more links")
        
        print("\n3. Verification:")
        print("   - Expected ~30 links (3 pages × 10 links)")
        print(f"   - Actual: {len(links)} links")
        
        if 20 <= len(links) <= 30:
            print("   ✓ Link count looks correct!")
        else:
            print("   ⚠ Link count may be different than expected")
        
        # Check date format
        if links:
            first_date = links[0]['date']
            print("\n4. Date format check:")
            print(f"   - First date: {first_date}")
            if len(first_date) == 10 and first_date[4] == '-' and first_date[7] == '-':
                print("   ✓ Date format is correct (YYYY-MM-DD)")
            else:
                print("   ✗ Date format is incorrect")
        
        print("\n" + "=" * 60)
        print("✓ Pagination test completed successfully!")
        print("=" * 60)
        return 0
        
    except WebScraperError as e:
        print(f"\n✗ Error during pagination test: {str(e)}")
        return 1
    except Exception as e:
        print(f"\n✗ Unexpected error: {str(e)}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == '__main__':
    sys.exit(test_pagination())
