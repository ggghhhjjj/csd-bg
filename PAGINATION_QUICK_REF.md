# POST Pagination Quick Reference

## 🚀 Quick Start

```bash
# Install (if needed)
pip install -r requirements.txt

# Test with 3 pages
python3 app.py --csv data.csv --db data.db --pagination --max-pages 3

# Scrape all pages (takes 2-3 minutes)
python3 app.py --csv data.csv --db data.db --pagination
```

## 📋 Command-Line Options

| Option | Description | Example |
|--------|-------------|---------|
| `--pagination` | Enable pagination | `--pagination` |
| `--max-pages N` | Limit to N pages | `--max-pages 10` |
| `--timeout N` | HTTP timeout (seconds) | `--timeout 60` |

## 🐍 Python API

```python
from src.web_scraper import WebScraper

scraper = WebScraper(timeout=30)

# Single page (~10 links)
links = scraper.scrape()

# All pages (~1000+ links)
all_links = scraper.scrape_with_post_pagination()

# First 5 pages (~50 links)
some_links = scraper.scrape_with_post_pagination(max_pages=5)
```

## 📊 Performance

| Scenario | Pages | Links | Time |
|----------|-------|-------|------|
| Single page | 1 | ~10 | 2s |
| 10 pages | 10 | ~100 | 20s |
| All pages | 100+ | ~1000+ | 2-3min |

## ✅ Testing

```bash
# Unit tests
python3 -m pytest tests/test_web_scraper.py -v

# Live test (3 pages)
python3 test_pagination_live.py

# Examples
python3 examples_pagination.py
```

## 🔧 How It Works

1. Fetch initial page → get ViewState & nonce
2. POST to page 2 with offset=10
3. Parse XML response → extract links
4. Update ViewState from response
5. Repeat for page 3, 4, 5... until done

## 🎯 Common Use Cases

### Get Latest 50 Links

```bash
python3 app.py --csv latest.csv --db latest.db --pagination --max-pages 5
```

### Get All Historical Data

```bash
python3 app.py --csv all_data.csv --db all_data.db --pagination
```

### Test Setup

```bash
python3 app.py --csv test.csv --db test.db --pagination --max-pages 1
```

## 📚 Documentation

- Full guide: `POST_PAGINATION_GUIDE.md`
- Summary: `PAGINATION_IMPLEMENTATION_SUMMARY.md`
- Examples: `examples_pagination.py`
- Live test: `test_pagination_live.py`

## ⚠️ Error Handling

| Error | Cause | Solution |
|-------|-------|----------|
| "Failed to extract ViewState" | Website changed | Check HTML structure |
| "Failed to parse XML" | Network/server issue | Check connectivity |
| "Network timeout" | Slow connection | Increase `--timeout` |

## 💡 Tips

- Start with `--max-pages 3` to test
- Use `--pagination` for complete data
- Check logs in `app.log` for details
- Press Ctrl+C to cancel anytime

## 🆚 vs Selenium

| Feature | POST Pagination | Selenium |
|---------|----------------|----------|
| Speed | ⚡ 2-3 min | 🐌 6-10 min |
| Memory | 💚 50MB | 💛 200MB |
| Setup | ✅ Simple | 🔧 Complex |
| Dependencies | 📦 2 packages | 📦 4+ packages |
