import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { DatabaseManagerError } from "./errors.js";
import { deletePdf, pdfFileExists, readPdf, writePdf } from "./pdf-storage.js";
import type { ExtractedRow, FreeFloatRecord, PendingPdfDownload, PendingPdfExtraction } from "./types.js";

export interface InitializeTablesResult {
  migratedPdfs: number;
}

export class DatabaseManager {
  private db: Database.Database | null = null;

  constructor(
    private readonly dbPath: string,
    readonly pdfDir: string,
  ) {
    mkdirSync(dirname(dbPath), { recursive: true });
    mkdirSync(pdfDir, { recursive: true });
  }

  connect(): void {
    try {
      this.db = new Database(this.dbPath);
      this.db.pragma("foreign_keys = ON");
    } catch (error) {
      throw new DatabaseManagerError(
        `Failed to connect to database: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  disconnect(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  using<T>(fn: (manager: DatabaseManager) => T): T {
    this.connect();
    try {
      return fn(this);
    } finally {
      this.disconnect();
    }
  }

  private requireConnection(): Database.Database {
    if (!this.db) {
      throw new DatabaseManagerError("Not connected to database");
    }
    return this.db;
  }

  initializeTables(): InitializeTablesResult {
    const db = this.requireConnection();

    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS free_float (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          date TEXT NOT NULL UNIQUE,
          url TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS pdf_content (
          free_float_id INTEGER PRIMARY KEY,
          content BLOB,
          size_bytes INTEGER,
          status TEXT NOT NULL CHECK(status IN ('downloaded', 'failed')),
          attempts INTEGER NOT NULL DEFAULT 0,
          last_error TEXT,
          downloaded_at TIMESTAMP,
          failed_at TIMESTAMP,
          extract_status TEXT CHECK(
            extract_status IS NULL
            OR extract_status IN ('extracted', 'failed')
          ),
          extract_attempts INTEGER NOT NULL DEFAULT 0,
          extract_last_error TEXT,
          extracted_at TIMESTAMP,
          extract_failed_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (free_float_id) REFERENCES free_float(id)
        );

        CREATE TABLE IF NOT EXISTS stock_issue (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          isin TEXT NOT NULL UNIQUE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS issuer (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          stock_issue_id INTEGER NOT NULL REFERENCES stock_issue(id),
          free_float_id INTEGER NOT NULL REFERENCES free_float(id),
          name TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(stock_issue_id, free_float_id)
        );

        CREATE TABLE IF NOT EXISTS stock_issue_daily (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          stock_issue_id INTEGER NOT NULL REFERENCES stock_issue(id),
          free_float_id INTEGER NOT NULL REFERENCES free_float(id),
          total_shares INTEGER NOT NULL,
          free_float INTEGER NOT NULL,
          shareholders INTEGER NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(stock_issue_id, free_float_id)
        );
      `);

      this.migratePdfContentExtractColumns(db);
      const migratedPdfs = this.migratePdfBlobsToFiles(db);
      if (migratedPdfs > 0) {
        db.exec("VACUUM");
      }
      return { migratedPdfs };
    } catch (error) {
      throw new DatabaseManagerError(
        `Failed to initialize tables: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private migratePdfContentExtractColumns(db: Database.Database): void {
    const columns = db.prepare("PRAGMA table_info(pdf_content)").all() as Array<{ name: string }>;
    const existing = new Set(columns.map((column) => column.name));
    const alterations: Record<string, string> = {
      extract_status: "TEXT",
      extract_attempts: "INTEGER NOT NULL DEFAULT 0",
      extract_last_error: "TEXT",
      extracted_at: "TIMESTAMP",
      extract_failed_at: "TIMESTAMP",
    };

    for (const [column, typedef] of Object.entries(alterations)) {
      if (!existing.has(column)) {
        db.exec(`ALTER TABLE pdf_content ADD COLUMN ${column} ${typedef}`);
      }
    }
  }

  private migratePdfBlobsToFiles(db: Database.Database): number {
    const rows = db
      .prepare(
        `
        SELECT pc.free_float_id, ff.date, pc.content
        FROM pdf_content pc
        INNER JOIN free_float ff ON ff.id = pc.free_float_id
        WHERE pc.status = 'downloaded'
          AND pc.content IS NOT NULL
      `,
      )
      .all() as Array<{ free_float_id: number; date: string; content: Buffer | Uint8Array }>;

    if (rows.length === 0) {
      return 0;
    }

    const clearBlob = db.prepare(
      `
      UPDATE pdf_content
      SET content = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE free_float_id = ?
    `,
    );

    const migrate = db.transaction((blobRows: typeof rows) => {
      let migrated = 0;
      for (const row of blobRows) {
        const content = Buffer.isBuffer(row.content) ? row.content : Buffer.from(row.content);
        if (!pdfFileExists(this.pdfDir, row.date)) {
          writePdf(this.pdfDir, row.date, content);
        }
        clearBlob.run(row.free_float_id);
        migrated += 1;
      }
      return migrated;
    });

    return migrate(rows);
  }

  private getFreeFloatDate(freeFloatId: number): string | null {
    const db = this.requireConnection();
    const row = db
      .prepare("SELECT date FROM free_float WHERE id = ?")
      .get(freeFloatId) as { date: string } | undefined;
    return row?.date ?? null;
  }

  recordExists(date: string): boolean {
    const db = this.requireConnection();
    try {
      const row = db.prepare("SELECT 1 AS found FROM free_float WHERE date = ?").get(date);
      return row !== undefined;
    } catch (error) {
      throw new DatabaseManagerError(
        `Failed to check record existence: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  insertRecord(date: string, url: string): number | null {
    const db = this.requireConnection();

    if (this.recordExists(date)) {
      return null;
    }

    try {
      const result = db
        .prepare("INSERT INTO free_float (date, url) VALUES (?, ?)")
        .run(date, url);
      return Number(result.lastInsertRowid);
    } catch (error) {
      if (error instanceof Error && /UNIQUE constraint failed/.test(error.message)) {
        return null;
      }
      throw new DatabaseManagerError(
        `Failed to insert record: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  getAllRecords(): FreeFloatRecord[] {
    const db = this.requireConnection();
    try {
      return db
        .prepare("SELECT date, url, created_at FROM free_float ORDER BY date DESC")
        .all() as FreeFloatRecord[];
    } catch (error) {
      throw new DatabaseManagerError(
        `Failed to retrieve records: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  getRecordCount(): number {
    const db = this.requireConnection();
    try {
      const row = db.prepare("SELECT COUNT(*) AS count FROM free_float").get() as { count: number };
      return row.count;
    } catch (error) {
      throw new DatabaseManagerError(
        `Failed to count records: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  getPendingPdfDownloads(): PendingPdfDownload[] {
    const db = this.requireConnection();
    try {
      return db
        .prepare(
          `
          SELECT ff.id, ff.date, ff.url
          FROM free_float ff
          LEFT JOIN pdf_content pc ON pc.free_float_id = ff.id
          WHERE pc.free_float_id IS NULL
          ORDER BY ff.date DESC
        `,
        )
        .all() as PendingPdfDownload[];
    } catch (error) {
      throw new DatabaseManagerError(
        `Failed to retrieve pending PDF downloads: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  upsertPdfDownloaded(
    freeFloatId: number,
    date: string,
    content: Buffer,
    sizeBytes: number,
    attempts: number,
  ): void {
    const db = this.requireConnection();
    try {
      writePdf(this.pdfDir, date, content);
      db.prepare(
        `
        INSERT INTO pdf_content (
          free_float_id, content, size_bytes, status, attempts,
          last_error, downloaded_at, failed_at, updated_at
        ) VALUES (
          ?, NULL, ?, 'downloaded', ?,
          NULL, CURRENT_TIMESTAMP, NULL, CURRENT_TIMESTAMP
        )
        ON CONFLICT(free_float_id) DO UPDATE SET
          content = NULL,
          size_bytes = excluded.size_bytes,
          status = 'downloaded',
          attempts = excluded.attempts,
          last_error = NULL,
          downloaded_at = CURRENT_TIMESTAMP,
          failed_at = NULL,
          updated_at = CURRENT_TIMESTAMP
      `,
      ).run(freeFloatId, sizeBytes, attempts);
    } catch (error) {
      throw new DatabaseManagerError(
        `Failed to store PDF content for id ${freeFloatId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  markPdfFailed(freeFloatId: number, attempts: number, lastError: string): void {
    const db = this.requireConnection();
    try {
      const date = this.getFreeFloatDate(freeFloatId);
      if (date) {
        deletePdf(this.pdfDir, date);
      }

      db.prepare(
        `
        INSERT INTO pdf_content (
          free_float_id, content, size_bytes, status, attempts,
          last_error, downloaded_at, failed_at, updated_at
        ) VALUES (
          ?, NULL, NULL, 'failed', ?,
          ?, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
        ON CONFLICT(free_float_id) DO UPDATE SET
          content = NULL,
          size_bytes = NULL,
          status = 'failed',
          attempts = excluded.attempts,
          last_error = excluded.last_error,
          downloaded_at = NULL,
          failed_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      `,
      ).run(freeFloatId, attempts, lastError);
    } catch (error) {
      throw new DatabaseManagerError(
        `Failed to mark PDF failed for id ${freeFloatId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  clearFailedPdfDownloads(freeFloatId?: number | null): number {
    const db = this.requireConnection();
    try {
      const result =
        freeFloatId === undefined || freeFloatId === null
          ? db.prepare("DELETE FROM pdf_content WHERE status = 'failed'").run()
          : db
              .prepare("DELETE FROM pdf_content WHERE status = 'failed' AND free_float_id = ?")
              .run(freeFloatId);
      return result.changes;
    } catch (error) {
      throw new DatabaseManagerError(
        `Failed to clear failed PDF downloads: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  getPendingPdfExtractions(): PendingPdfExtraction[] {
    const db = this.requireConnection();
    try {
      const rows = db
        .prepare(
          `
          SELECT ff.id AS free_float_id, ff.date
          FROM free_float ff
          INNER JOIN pdf_content pc ON pc.free_float_id = ff.id
          WHERE pc.status = 'downloaded'
            AND pc.extract_status IS NULL
          ORDER BY ff.date DESC
        `,
        )
        .all() as Array<{ free_float_id: number; date: string }>;

      return rows.map((row) => ({
        free_float_id: row.free_float_id,
        date: row.date,
      }));
    } catch (error) {
      throw new DatabaseManagerError(
        `Failed to retrieve pending PDF extractions: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  readDownloadedPdf(date: string): Buffer {
    return readPdf(this.pdfDir, date);
  }

  saveExtractedRows(freeFloatId: number, rows: ExtractedRow[]): void {
    const db = this.requireConnection();
    const insertStockIssue = db.prepare("INSERT INTO stock_issue (isin) VALUES (?)");
    const selectStockIssue = db.prepare("SELECT id FROM stock_issue WHERE isin = ?");
    const upsertIssuer = db.prepare(
      `
      INSERT INTO issuer (stock_issue_id, free_float_id, name)
      VALUES (?, ?, ?)
      ON CONFLICT(stock_issue_id, free_float_id) DO UPDATE SET
        name = excluded.name
    `,
    );
    const upsertDaily = db.prepare(
      `
      INSERT INTO stock_issue_daily (
        stock_issue_id, free_float_id,
        total_shares, free_float, shareholders
      ) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(stock_issue_id, free_float_id) DO UPDATE SET
        total_shares = excluded.total_shares,
        free_float = excluded.free_float,
        shareholders = excluded.shareholders
    `,
    );

    const transaction = db.transaction((extractedRows: ExtractedRow[]) => {
      for (const row of extractedRows) {
        const existing = selectStockIssue.get(row.isin) as { id: number } | undefined;
        let stockIssueId: number;
        if (existing) {
          stockIssueId = existing.id;
        } else {
          const result = insertStockIssue.run(row.isin);
          stockIssueId = Number(result.lastInsertRowid);
        }

        upsertIssuer.run(stockIssueId, freeFloatId, row.issuer_name);
        upsertDaily.run(
          stockIssueId,
          freeFloatId,
          row.total_shares,
          row.free_float,
          row.shareholders,
        );
      }
    });

    try {
      transaction(rows);
    } catch (error) {
      throw new DatabaseManagerError(
        `Failed to save extracted rows for free_float_id=${freeFloatId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  markPdfExtracted(freeFloatId: number, attempts = 1): void {
    const db = this.requireConnection();
    try {
      db.prepare(
        `
        UPDATE pdf_content
        SET extract_status = 'extracted',
            extract_attempts = ?,
            extract_last_error = NULL,
            extracted_at = CURRENT_TIMESTAMP,
            extract_failed_at = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE free_float_id = ?
      `,
      ).run(attempts, freeFloatId);
    } catch (error) {
      throw new DatabaseManagerError(
        `Failed to mark PDF extracted for id ${freeFloatId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  markPdfExtractFailed(freeFloatId: number, attempts: number, lastError: string): void {
    const db = this.requireConnection();
    try {
      db.prepare(
        `
        UPDATE pdf_content
        SET extract_status = 'failed',
            extract_attempts = ?,
            extract_last_error = ?,
            extract_failed_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE free_float_id = ?
      `,
      ).run(attempts, lastError, freeFloatId);
    } catch (error) {
      throw new DatabaseManagerError(
        `Failed to mark PDF extract failed for id ${freeFloatId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  clearFailedPdfExtractions(freeFloatId?: number | null): number {
    const db = this.requireConnection();
    try {
      const result =
        freeFloatId === undefined || freeFloatId === null
          ? db
              .prepare(
                `
              UPDATE pdf_content
              SET extract_status = NULL,
                  extract_attempts = 0,
                  extract_last_error = NULL,
                  extract_failed_at = NULL,
                  updated_at = CURRENT_TIMESTAMP
              WHERE extract_status = 'failed'
            `,
              )
              .run()
          : db
              .prepare(
                `
              UPDATE pdf_content
              SET extract_status = NULL,
                  extract_attempts = 0,
                  extract_last_error = NULL,
                  extract_failed_at = NULL,
                  updated_at = CURRENT_TIMESTAMP
              WHERE extract_status = 'failed' AND free_float_id = ?
            `,
              )
              .run(freeFloatId);
      return result.changes;
    } catch (error) {
      throw new DatabaseManagerError(
        `Failed to clear failed PDF extractions: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  queryDailyMetrics(limit = 100): Array<{
    date: string;
    isin: string;
    issuer_name: string;
    total_shares: number;
    free_float: number;
    shareholders: number;
  }> {
    const db = this.requireConnection();
    return db
      .prepare(
        `
        SELECT ff.date, si.isin, i.name AS issuer_name,
               sid.total_shares, sid.free_float, sid.shareholders
        FROM stock_issue_daily sid
        INNER JOIN stock_issue si ON si.id = sid.stock_issue_id
        INNER JOIN issuer i ON i.stock_issue_id = sid.stock_issue_id
          AND i.free_float_id = sid.free_float_id
        INNER JOIN free_float ff ON ff.id = sid.free_float_id
        ORDER BY ff.date DESC, si.isin ASC
        LIMIT ?
      `,
      )
      .all(limit) as Array<{
      date: string;
      isin: string;
      issuer_name: string;
      total_shares: number;
      free_float: number;
      shareholders: number;
    }>;
  }

  queryIssuerTrend(isin: string): Array<{
    date: string;
    free_float: number;
    total_shares: number;
    shareholders: number;
  }> {
    const db = this.requireConnection();
    return db
      .prepare(
        `
        SELECT ff.date, sid.free_float, sid.total_shares, sid.shareholders
        FROM stock_issue_daily sid
        INNER JOIN stock_issue si ON si.id = sid.stock_issue_id
        INNER JOIN free_float ff ON ff.id = sid.free_float_id
        WHERE si.isin = ?
        ORDER BY ff.date ASC
      `,
      )
      .all(isin) as Array<{
      date: string;
      free_float: number;
      total_shares: number;
      shareholders: number;
    }>;
  }
}
