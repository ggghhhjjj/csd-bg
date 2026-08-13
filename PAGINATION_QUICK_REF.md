# POST Pagination Quick Reference

## Quick Start

```bash
# Install and build
npm install && npm run build

# Test with 3 pages
node packages/cli/dist/index.js scrape --db data.db --max-pages 3

# Scrape all pages (takes 2-3 minutes)
node packages/cli/dist/index.js scrape --db data.db
```

> CSV export is optional — add `--verbose` to also write `free_float.csv`. See [README.md](README.md#csv-export-verbose-mode).

## Command-Line Options

| Option | Description | Example |
|--------|-------------|---------|
| (default) | POST pagination enabled | omit `--no-pagination` |
| `--no-pagination` | First page only | `--no-pagination` |
| `--max-pages N` | Limit to N pages | `--max-pages 10` |
| `--timeout N` | HTTP timeout (seconds) | `--timeout 60` |
| `-v, --verbose` | DEBUG logging + CSV export | `--verbose` |

## TypeScript API

```typescript
import { WebScraper } from "@csd-bg/core";

const scraper = new WebScraper({ timeout: 30 });

// Single page (~10 links)
const links = await scraper.scrape();

// All pages (~1000+ links)
const allLinks = await scraper.scrapeWithPostPagination();

// First 5 pages (~50 links)
const someLinks = await scraper.scrapeWithPostPagination(5);
```

## Performance

| Scenario | Pages | Links | Time |
|----------|-------|-------|------|
| Single page | 1 | ~10 | 2s |
| 10 pages | 10 | ~100 | 20s |
| All pages | 100+ | ~1000+ | 2-3min |

## Testing

```bash
# Unit tests
npm test -- packages/core/tests/web-scraper.test.ts
```

## How It Works

1. Fetch initial page → get ViewState & nonce
2. POST to page 2 with offset=10
3. Parse XML response → extract links
4. Update ViewState from response
5. Repeat for page 3, 4, 5... until done

## Common Use Cases

### Get Latest 50 Links

```bash
node packages/cli/dist/index.js scrape --db latest.db --max-pages 5
```

### Get All Historical Data

```bash
node packages/cli/dist/index.js scrape --db all_data.db
```

### Test Setup

```bash
node packages/cli/dist/index.js scrape --db test.db --max-pages 1
```

## Documentation

- Full guide: `POST_PAGINATION_GUIDE.md`
- Summary: `PAGINATION_IMPLEMENTATION_SUMMARY.md`
- Early stopping: `EARLY_STOPPING_GUIDE.md`

## Error Handling

| Error | Cause | Solution |
|-------|-------|----------|
| "Failed to extract ViewState" | Website changed | Check HTML structure |
| "Failed to parse XML" | Network/server issue | Check connectivity |
| "Network timeout" | Slow connection | Increase `--timeout` |

## Tips

- Start with `--max-pages 3` to test
- Pagination is on by default; use `--no-pagination` for first page only
- Check logs in `app.log` for details
- Press Ctrl+C to cancel anytime

## vs Selenium

| Feature | POST Pagination | Selenium |
|---------|----------------|----------|
| Speed | 2-3 min | 6-10 min |
| Memory | 50MB | 200MB |
| Setup | Simple | Complex |
| Dependencies | fetch + cheerio | Browser driver |
