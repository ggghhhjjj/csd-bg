#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_PATH="${1:-./data/free_float.db}"

if [[ ! -f "$DB_PATH" ]]; then
  echo "Database not found: $DB_PATH" >&2
  exit 1
fi

HAS_CONTENT_COL="$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM pragma_table_info('pdf_content') WHERE name = 'content';")"
if [[ "$HAS_CONTENT_COL" == "0" ]]; then
  echo "pdf_content.content column already absent in $DB_PATH"
  exit 0
fi

NON_NULL_COUNT="$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM pdf_content WHERE content IS NOT NULL;")"
echo "pdf_content rows with non-NULL content: $NON_NULL_COUNT"

if [[ "$NON_NULL_COUNT" != "0" ]]; then
  echo "Abort: migrate legacy blobs to disk before dropping the content column." >&2
  exit 1
fi

sqlite3 "$DB_PATH" < "$SCRIPT_DIR/drop-pdf-content-column.sql"
echo "Dropped pdf_content.content column and ran VACUUM on $DB_PATH"
