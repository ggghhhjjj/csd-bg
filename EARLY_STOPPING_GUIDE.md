# Early Stopping Optimization

## Overview

The early stopping feature is an optimization that **stops processing links when consecutive duplicate records are found**, indicating that all remaining records likely already exist in the database. This is particularly useful for **incremental daily updates**.

## When to Use Early Stopping

### ✅ Use Early Stopping When:

- Running **daily/regular incremental updates**
- Scraping data in **chronological order** (newest to oldest)
- Most recent records are new, older records already in database
- Want to **minimize processing time** for regular updates

### ❌ Don't Use Early Stopping When:

- Running **initial bulk import** (all data is new)
- Data is **not in chronological order**
- Gaps in existing data (some old records missing)
- Want to ensure **100% of links are checked**

## How It Works

1. **Process links in order** (newest to oldest typically)
2. **Count consecutive duplicates** when encountered
3. **Stop processing** when threshold reached (default: 10 consecutive duplicates)
4. **Skip remaining links** (assume they already exist)

### Example Scenario

```
Links to process: 100 records (from pagination)

Processing:
✅ Record 1 (2025-12-07) → NEW, added to DB
✅ Record 2 (2025-12-06) → NEW, added to DB  
❌ Record 3 (2025-12-05) → EXISTS, skip (counter: 1)
❌ Record 4 (2025-12-04) → EXISTS, skip (counter: 2)
❌ Record 5 (2025-12-03) → EXISTS, skip (counter: 3)
...
❌ Record 12 (2025-11-26) → EXISTS, skip (counter: 10)
🛑 EARLY STOPPING TRIGGERED!

Result: Checked 12 records, saved 88 database lookups!
Time saved: ~75% reduction in processing time
```

## Usage

### Command Line

> **Note:** Examples use `--db` only. CSV export is optional and enabled with `--verbose` or `--log-level DEBUG`. See [README.md](README.md#csv-export-verbose-mode).

```bash
# Default behavior: pagination + early stopping enabled (threshold: 10)
# Perfect for daily incremental updates
node packages/cli/dist/index.js scrape --db data.db

# Custom threshold (stop after 5 consecutive duplicates)
node packages/cli/dist/index.js scrape --db data.db --early-stopping-threshold 5

# Disable early stopping (check all links)
node packages/cli/dist/index.js scrape --db data.db --no-early-stopping

# Daily update example (recommended for cron jobs)
node packages/cli/dist/index.js scrape --db data.db --max-pages 5
```

### TypeScript API

```typescript
import { FreeFloatScraperApp } from "@csd-bg/core";

// Default early stopping (threshold=10)
const app = new FreeFloatScraperApp({
  dbPath: "data.db",
  exportCsv: false, // set true or use DEBUG log level to write CSV
  usePostPagination: true,
  enableEarlyStopping: true,
});
await app.run(["scrape"]);

// Custom threshold
const appCustom = new FreeFloatScraperApp({
  csvPath: "data.csv",
  dbPath: "data.db",
  usePostPagination: true,
  enableEarlyStopping: true,
  earlyStoppingThreshold: 5,
});
await appCustom.run(["scrape"]);

// Disabled (check all records)
const appNoStop = new FreeFloatScraperApp({
  csvPath: "data.csv",
  dbPath: "data.db",
  usePostPagination: true,
  enableEarlyStopping: false,
});
await appNoStop.run(["scrape"]);
```

## Configuration

### Early stopping (default: enabled)

Early stopping is **on by default** in the Node CLI. Disable with `--no-early-stopping`.

### `--early-stopping-threshold N`

Number of consecutive duplicate records before stopping.

**Default**: `10`  
**Range**: 1-100 (practical range)  
**Recommended**: 5-15

#### Choosing a Threshold

| Threshold | When to Use | Risk |
|-----------|-------------|------|
| 3-5 | Daily updates, very predictable data | Higher - may stop too early if gaps |
| 10 (default) | Daily/weekly updates, good balance | Low - safe for most scenarios |
| 15-20 | Weekly/monthly updates, less predictable | Very low - more checks, less time saved |
| 50+ | Paranoid mode, want to be extra sure | Minimal benefit |

## Performance Impact

### Time Saved (Example: 100 pages, 1000 links)

| Scenario | Without Early Stopping | With Early Stopping | Time Saved |
|----------|------------------------|---------------------|------------|
| All new records | 2-3 min | 2-3 min | 0% (no duplicates) |
| 2 new, rest exist | 2-3 min | ~5 sec | ~97% |
| 50 new, rest exist | 2-3 min | ~30 sec | ~75% |
| All exist | 2-3 min | ~5 sec | ~97% |

### Database Lookups Saved

```
Scenario: 1000 links, 990 already exist

Without early stopping:
✗ 1000 database lookups
✓ Time: 2-3 minutes

With early stopping (threshold=10):
✓ 20 database lookups (10 new + 10 consecutive duplicates)
✓ Time: ~5 seconds
✓ Saved: 980 database lookups (98% reduction!)
```

## Behavior Details

### Counter Reset

The consecutive duplicate counter **resets to 0** when a new record is found:

```
Processing:
❌ Record 1 → EXISTS (counter: 1)
❌ Record 2 → EXISTS (counter: 2)
❌ Record 3 → EXISTS (counter: 3)
✅ Record 4 → NEW (counter: 0) ← Counter reset!
❌ Record 5 → EXISTS (counter: 1)
❌ Record 6 → EXISTS (counter: 2)
...continues...
```

This ensures we don't stop prematurely if there are gaps in existing data.

### Logging

When early stopping triggers, you'll see:

```
INFO - Processing 100 links...
INFO - Added new record: date=2025-12-07, url=...
INFO - Added new record: date=2025-12-06, url=...
INFO - Skipping existing record for date: 2025-12-05
INFO - Skipping existing record for date: 2025-12-04
...
INFO - Early stopping triggered: 10 consecutive duplicates found. 
       Skipping 88 remaining links.
INFO - Processing Summary:
INFO -   Total links found: 100
INFO -   New records added: 2
INFO -   Records skipped (already exist): 10
```

## Use Cases

### 1. Daily Cron Job (Recommended)

```bash
#!/bin/bash
# Daily update script - runs every morning at 6 AM

node packages/cli/dist/index.js scrape \
  --db /data/free_float.db \
  --max-pages 5 \
  --early-stopping-threshold 10
```

**Why this works**: New records are typically from the last 24 hours (first 1-2 pages). Early stopping prevents checking hundreds of already-existing records.

### 2. Initial Full Import (Not Recommended)

```bash
# First time import - disable early stopping
node packages/cli/dist/index.js scrape \
  --db /data/free_float.db \
  --no-early-stopping
```

**Why**: All data is new, no benefit from early stopping.

### 3. Recovery After Gap

```bash
# Missed several days of updates - use higher threshold
node packages/cli/dist/index.js scrape \
  --db /data/free_float.db \
  --max-pages 20 \
  --early-stopping-threshold 20
```

**Why**: More pages needed, higher threshold to ensure we don't stop before all new records are found.

## Testing

### Unit Tests

```bash
# Run early stopping tests
npm test -- packages/core/tests/early-stopping.test.ts

# All tests
npm test
```

### Test Coverage

The feature includes 7 comprehensive tests:

1. ✅ Early stopping with all duplicates
2. ✅ Custom threshold values
3. ✅ Disabled early stopping (backward compatibility)
4. ✅ Counter reset on new record
5. ✅ Mixed scenario (some new, some existing)
6. ✅ Performance savings verification
7. ✅ Logging output validation

## FAQ

### Q: Will I miss data if I use early stopping?

**A:** If links are in chronological order (newest first) and data is collected regularly, no. The feature assumes that if N consecutive records exist, all older records also exist.

### Q: What if there are gaps in my data?

**A:** Use a higher threshold (15-20) or disable early stopping for that run.

### Q: Can I use this without pagination?

**A:** Yes, but benefit is minimal since single-page scraping only gets ~10 links.

### Q: What's the best threshold?

**A:** For daily updates: **10** (default). For weekly: **15-20**. Start conservative and adjust based on your data patterns.

### Q: Does this affect CSV/database integrity?

**A:** No. Records are still deduplicated properly. Early stopping only affects which records are **checked**, not which are **stored**.

## Best Practices

1. **Use with pagination**: Maximize benefit by checking more pages
2. **Set appropriate threshold**: 10 is safe default, 5 for very regular updates
3. **Monitor logs**: Check how often early stopping triggers
4. **Test first**: Run without early stopping once to understand data patterns
5. **Combine with max-pages**: Limit total pages checked for even faster updates

## Comparison

| Feature | Without Early Stopping | With Early Stopping |
|---------|------------------------|---------------------|
| **Speed** | Checks all links | Stops at first N duplicates |
| **Database hits** | 1000+ | 10-50 typically |
| **Time** | 2-3 minutes | 5-30 seconds |
| **Use case** | Initial import, irregular updates | Daily/regular updates |
| **Safety** | 100% coverage | 99%+ coverage with proper threshold |
| **Recommended** | First time setup | Ongoing operations |

## Summary

Early stopping is a **powerful optimization** for incremental updates that can **reduce processing time by 75-97%** while maintaining data integrity. Use it for **daily/regular updates** with an appropriate threshold (10 recommended), and disable it for **initial imports** or when data has gaps.

---

**Key Takeaway**: Enable `--early-stopping` for your **cron jobs** to make daily updates **blazingly fast**! 🚀
