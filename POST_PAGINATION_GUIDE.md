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

> **Note:** Examples use `--db` only. CSV export is optional and enabled with `--verbose` or `--log-level DEBUG`. See [README.md](README.md#csv-export-verbose-mode).

```bash
# Scrape all pages using POST pagination (default behavior)
# Also enables early stopping when duplicates found
node packages/cli/dist/index.js scrape --db data.db

# Scrape first page only (disable pagination)
node packages/cli/dist/index.js scrape --db data.db --no-pagination

# Scrape first 5 pages only
node packages/cli/dist/index.js scrape --db data.db --max-pages 5

# Scrape all pages without early stopping
node packages/cli/dist/index.js scrape --db data.db --no-early-stopping
```

### Makefile (`make run`)

For local development, `make run` applies incremental limits by default so an already-populated database does not trigger a full-site pagination walk:

```bash
make run                              # --max-pages 5 --early-stopping-threshold 10
make run MAX_PAGES=20                 # catch up after a gap
```

See [PAGINATION_QUICK_REF.md](PAGINATION_QUICK_REF.md) and [EARLY_STOPPING_GUIDE.md](EARLY_STOPPING_GUIDE.md) for details on how page limits and early stopping interact.

### TypeScript API

```typescript
import { WebScraper } from "@csd-bg/core";

const scraper = new WebScraper({ timeout: 30 });

// Scrape first page only
const links = await scraper.scrape();
console.log(`Found ${links.length} links`); // ~10 links

// Scrape all pages
const allLinks = await scraper.scrapeWithPostPagination();
console.log(`Found ${allLinks.length} links`); // ~1000+ links

// Scrape limited number of pages
const limitedLinks = await scraper.scrapeWithPostPagination(5);
console.log(`Found ${limitedLinks.length} links`); // ~50 links
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
npm test

# Web scraper tests only
npm test -- packages/core/tests/web-scraper.test.ts
```

Tests cover:
- ViewState and nonce extraction
- XML response parsing
- POST request data formatting
- Pagination loop logic
- Error handling scenarios

### Live Test

Test against the real website manually with limited pages:

```bash
node packages/cli/dist/index.js scrape --db data.db --max-pages 3
```

## API Reference

### `WebScraper.scrapeWithPostPagination(maxPages?)`

Scrape Free Float links using POST-based pagination.

**Parameters:**
- `maxPages` (number, optional): Maximum number of pages to scrape. If omitted, scrapes all pages until no more links found.

**Returns:**
- `FreeFloatLink[]`: Array of link objects with:
  - `date`: Date in YYYY-MM-DD format
  - `url`: Full URL to PDF
  - `href`: Relative path to PDF

**Throws:**
- `WebScraperError`: If fetching initial page fails, or if ViewState/nonce extraction fails

**Example:**

```typescript
const scraper = new WebScraper();
try {
  const links = await scraper.scrapeWithPostPagination(10);
  for (const link of links) {
    console.log(`${link.date}: ${link.url}`);
  }
} catch (error) {
  console.error(`Error: ${error}`);
}
```

### `WebScraper.extractFormParams(htmlContent)`

Extract ViewState and nonce from HTML page.

**Parameters:**
- `htmlContent` (string): HTML content from initial page load

**Returns:**
- `{ viewState: string; nonce: string }`

**Throws:**
- `WebScraperError`: If ViewState or nonce cannot be found

### `WebScraper.parseAjaxResponse(xmlContent)`

Parse AJAX XML response to extract links and ViewState.

**Parameters:**
- `xmlContent` (string): XML response from pagination POST request

**Returns:**
- `{ links: FreeFloatLink[]; viewState: string | null }`

**Throws:**
- `WebScraperError`: If XML parsing fails

### `WebScraper.fetchPaginatedData(pageNumber, viewState, nonce, rowsPerPage?)`

Fetch a specific page using POST request.

**Parameters:**
- `pageNumber` (number): Page number (1-indexed)
- `viewState` (string): Current ViewState value
- `nonce` (string): Security nonce
- `rowsPerPage` (number): Number of rows per page (default: 10)

**Returns:**
- `{ links: FreeFloatLink[]; viewState: string | null }`

**Throws:**
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
