# Test Fixtures

This directory contains test fixture files used by the test suite.

## Files

### `csd_home.html`
Real HTML snapshot from `https://csd-bg.bg/members/memberStatistics.xhtml` (captured on 2025-12-04).

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

1. Visit `https://csd-bg.bg/members/memberStatistics.xhtml`
2. Save the page as HTML (View Source → Save As)
3. Replace `csd_home.html` with the new version
4. Run tests to verify scraper still works: `pytest tests/test_web_scraper.py -v`
5. Update scraper code if needed to handle new structure
