# Test Fixtures

This directory contains test fixture files used by the test suite.

## Files

### `csd_home.html`
HTML snapshot of the member statistics page (captured 2025-12-04). Configure the live URL via `CSD_BG_STATISTICS_URL` in `.env` when refreshing this file.

**Purpose**: Used to test the web scraper with authentic HTML structure from the target website.

**Contains**: 10 Free Float PDF links from dates:
- 2025-12-04
- 2025-12-03
- 2025-12-02
- 2025-12-01
- 2025-11-28
- 2025-11-27
- 2025-11-26
- 2025-11-25
- 2025-11-24
- 2025-11-21

**Used in tests**:
- `test_extract_free_float_links_real_html()` - Tests scraper with real HTML structure

## Why Use Real HTML Fixtures?

1. **Accuracy**: Tests verify the scraper works with actual website structure
2. **Regression Detection**: Changes in website structure will be caught by tests
3. **Edge Cases**: Real HTML often contains complexities not present in simplified test data
4. **Documentation**: Serves as a snapshot of the website structure at a point in time

## Updating Fixtures

When the website structure changes:

1. Open the statistics page URL from your local `.env` (`CSD_BG_STATISTICS_URL`)
2. Save the page as HTML (View Source → Save As)
3. Replace `csd_home.html` with the new version
4. Run tests to verify scraper still works: `npm test -- packages/core/tests/web-scraper.test.ts`
5. Update scraper code if needed to handle new structure
