-- Prerequisite: run scripts/drop-pdf-content-column.sh (checks content IS NULL everywhere).
ALTER TABLE pdf_content DROP COLUMN content;

VACUUM;
