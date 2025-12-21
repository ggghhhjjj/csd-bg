# POST-Based Pagination Guide

## Overview

The CSD-BG web scraper now supports efficient POST-based pagination to extract Free Float links from all pages on the website. This method uses AJAX POST requests to navigate through pages without requiring browser automation.

## How It Works

### The Challenge

The CSD-BG website displays Free Float links across multiple pages (typically 100+ pages with 10 links per page). The pagination is JavaScript-based and requires specific POST request parameters to navigate between pages.

### The Solution

Instead of using browser automation (Selenium), we reverse-engineered the AJAX pagination requests to directly POST to the server with the correct parameters:

1. **Initial Page Load**: Fetch the first page to extract:
   - ViewState (session state identifier)
   - Nonce (security token)
   - First 10 links

2. **Pagination Loop**: For each subsequent page:
   - Build POST request with form data
   - Include ViewState and nonce for authentication
   - Set `formFF:j_idt46_first` parameter to page offset (0, 10, 20, ...)
   - Parse XML response containing CDATA with HTML links
   - Extract ViewState for next request
   - Continue until no more links found

## Usage

### Command Line

```bash
# Scrape all pages using POST pagination (default behavior)
# Also enables early stopping when duplicates found
python3 app.py --csv data.csv --db data.db

# Scrape first page only (disable pagination)
python3 app.py --csv data.csv --db data.db --no-pagination

# Scrape first 5 pages only
python3 app.py --csv data.csv --db data.db --max-pages 5

# Scrape all pages without early stopping
python3 app.py --csv data.csv --db data.db --no-early-stopping
```

### Python API

```python
from src.web_scraper import WebScraper

# Create scraper instance
scraper = WebScraper(timeout=30)

# Scrape first page only
links = scraper.scrape()
print(f"Found {len(links)} links")  # ~10 links

# Scrape all pages
all_links = scraper.scrape_with_post_pagination()
print(f"Found {len(all_links)} links")  # ~1000+ links

# Scrape limited number of pages
limited_links = scraper.scrape_with_post_pagination(max_pages=5)
print(f"Found {len(limited_links)} links")  # ~50 links
```

## Technical Details

### POST Request Format

Each pagination request sends form-encoded data:

```
javax.faces.partial.ajax=true
javax.faces.source=formFF:j_idt46
javax.faces.partial.execute=formFF:j_idt46
javax.faces.partial.render=formFF:j_idt46
formFF:j_idt46_pagination=true
formFF:j_idt46_first=<offset>           # 0, 10, 20, 30, ...
formFF:j_idt46_rows=10                  # Links per page
formFF=formFF
formFF:j_idt46=list
formFF:j_idt44_collapsed=false
javax.faces.ViewState=<view_state>      # From previous response
primefaces.nonce=<nonce>                # From initial page
```

### Response Format

The server returns XML with CDATA containing HTML:

```xml
<?xml version='1.0' encoding='UTF-8'?>
<partial-response id="j_id1">
    <changes>
        <update id="formFF:j_idt46">
            <![CDATA[
                <ul class="ui-dataview-list-container">
                    <li class="ui-dataview-row">
                        <a href="/ffloat/FREE_FLOAT_20251205.pdf">Free Float за 2025-12-05</a>
                    </li>
                    <!-- More links -->
                </ul>
            ]]>
        </update>
        <update id="j_id1:javax.faces.ViewState:0">
            <![CDATA[-2187822647981327038:2544928799145319437]]>
        </update>
    </changes>
</partial-response>
```

## Performance

### Comparison

| Method | Pages | Links | Time | Memory |
|--------|-------|-------|------|--------|
| Single page | 1 | ~10 | ~2s | ~20MB |
| POST pagination (10 pages) | 10 | ~100 | ~15s | ~30MB |
| POST pagination (all pages) | 100+ | ~1000+ | ~2-3min | ~50MB |
| Selenium pagination | 100+ | ~1000+ | ~6-10min | ~200MB |

### Advantages over Selenium

- **5x Faster**: No browser startup/rendering overhead
- **4x Less Memory**: No browser process
- **More Reliable**: Direct HTTP requests, no JavaScript timing issues
- **Simpler Setup**: No ChromeDriver installation needed

## Error Handling

The pagination system includes robust error handling:

- **Missing ViewState/Nonce**: Raises `WebScraperError` with clear message
- **Network Errors**: Logs warning and returns collected links
- **Parse Errors**: Raises `WebScraperError` with XML parse details
- **Empty Pages**: Stops after 3 consecutive empty pages

## Testing

### Unit Tests

Run the comprehensive test suite:

```bash
python3 -m pytest tests/test_web_scraper.py -v
```

Tests cover:
- ViewState and nonce extraction
- XML response parsing
- POST request data formatting
- Pagination loop logic
- Error handling scenarios

### Live Test

Test against the real website (limited to 3 pages):

```bash
python3 test_pagination_live.py
```

## API Reference

### `WebScraper.scrape_with_post_pagination(max_pages=None)`

Scrape Free Float links using POST-based pagination.

**Parameters:**
- `max_pages` (int, optional): Maximum number of pages to scrape. If `None`, scrapes all pages until no more links found.

**Returns:**
- `List[Dict[str, str]]`: List of link dictionaries with keys:
  - `date`: Date in YYYY-MM-DD format
  - `url`: Full URL to PDF
  - `href`: Relative path to PDF

**Raises:**
- `WebScraperError`: If fetching initial page fails, or if ViewState/nonce extraction fails

**Example:**

```python
scraper = WebScraper()
try:
    links = scraper.scrape_with_post_pagination(max_pages=10)
    for link in links:
        print(f"{link['date']}: {link['url']}")
except WebScraperError as e:
    print(f"Error: {e}")
```

### `WebScraper.extract_form_params(html_content)`

Extract ViewState and nonce from HTML page.

**Parameters:**
- `html_content` (str): HTML content from initial page load

**Returns:**
- `Tuple[str, str]`: (view_state, nonce)

**Raises:**
- `WebScraperError`: If ViewState or nonce cannot be found

### `WebScraper.parse_ajax_response(xml_content)`

Parse AJAX XML response to extract links and ViewState.

**Parameters:**
- `xml_content` (str): XML response from pagination POST request

**Returns:**
- `Tuple[List[Dict[str, str]], Optional[str]]`: (links, updated_view_state)

**Raises:**
- `WebScraperError`: If XML parsing fails

### `WebScraper.fetch_paginated_data(page_number, view_state, nonce, rows_per_page=10)`

Fetch a specific page using POST request.

**Parameters:**
- `page_number` (int): Page number (1-indexed)
- `view_state` (str): Current ViewState value
- `nonce` (str): Security nonce
- `rows_per_page` (int): Number of rows per page (default: 10)

**Returns:**
- `Tuple[List[Dict[str, str]], Optional[str]]`: (links, updated_view_state)

**Raises:**
- `WebScraperError`: If POST request fails

## Troubleshooting

### Issue: "Failed to extract ViewState"

**Cause**: Website HTML structure changed

**Solution**: Check if the ViewState input field still uses `name="javax.faces.ViewState"`

### Issue: "Failed to parse XML response"

**Cause**: Server returned non-XML content (error page, maintenance page)

**Solution**: Check network connectivity and website status

### Issue: Getting fewer links than expected

**Cause**: Website may have fewer pages available

**Solution**: Normal behavior - the scraper stops when pages are empty

### Issue: Session timeout errors

**Cause**: ViewState expired during long scraping sessions

**Solution**: The scraper automatically updates ViewState from each response

## Best Practices

1. **Start with Limited Pages**: Test with `--max-pages 5` before scraping all pages
2. **Monitor Output**: Watch logs for warnings about skipped pages
3. **Respect Rate Limits**: The scraper automatically paces requests (built-in delays)
4. **Handle Errors Gracefully**: Always wrap scraping code in try/except
5. **Verify Data**: Check that dates and URLs are correctly formatted

## Future Enhancements

Potential improvements:

- **Parallel Requests**: Fetch multiple pages simultaneously
- **Resume Support**: Continue from last successful page
- **Progress Bar**: Visual feedback for long scraping sessions
- **Retry Logic**: Automatically retry failed pages
- **Caching**: Store intermediate results to disk
