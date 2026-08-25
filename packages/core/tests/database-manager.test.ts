import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DatabaseManager, DatabaseManagerError } from "@csd-bg/core";

describe("DatabaseManager", () => {
  let tempDir: string;
  let dbPath: string;
  let pdfDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "csd-bg-db-"));
    dbPath = join(tempDir, "test_free_float.db");
    pdfDir = join(tempDir, "pdfs");
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  function createManager(db = dbPath, pdfs = pdfDir): DatabaseManager {
    return new DatabaseManager(db, pdfs);
  }

  it("creates nested db and pdf directories", () => {
    const nestedPath = join(tempDir, "nested", "path", "test.db");
    const nestedPdfDir = join(tempDir, "nested", "path", "pdfs");
    createManager(nestedPath, nestedPdfDir);
    expect(existsSync(nestedPdfDir)).toBe(true);
  });

  it("connects and disconnects", () => {
    const db = createManager();
    db.connect();
    db.disconnect();
  });

  it("supports using() context helper", () => {
    const db = createManager();
    db.using((manager) => {
      manager.initializeTables();
      expect(manager.getRecordCount()).toBe(0);
    });
  });

  it("initializes free_float schema", () => {
    const db = createManager();
    db.using((manager) => {
      manager.initializeTables();
      expect(manager.recordExists("2025-12-04")).toBe(false);
    });
  });

  it("requires connection for operations", () => {
    const db = createManager();
    expect(() => db.recordExists("2025-12-04")).toThrow(DatabaseManagerError);
    expect(() => db.insertRecord("2025-12-04", "https://example.com/a.pdf")).toThrow(
      DatabaseManagerError,
    );
  });

  it("inserts and checks records", () => {
    const db = createManager();
    db.using((manager) => {
      manager.initializeTables();
      const id = manager.insertRecord("2025-12-04", "https://example.com/test.pdf");
      expect(id).toBeTypeOf("number");
      expect(manager.recordExists("2025-12-04")).toBe(true);
    });
  });

  it("returns null for duplicate inserts", () => {
    const db = createManager();
    db.using((manager) => {
      manager.initializeTables();
      expect(manager.insertRecord("2025-12-04", "https://example.com/test1.pdf")).not.toBeNull();
      expect(manager.insertRecord("2025-12-04", "https://example.com/test2.pdf")).toBeNull();
      expect(manager.getRecordCount()).toBe(1);
    });
  });

  it("returns all records ordered by date desc", () => {
    const db = createManager();
    db.using((manager) => {
      manager.initializeTables();
      manager.insertRecord("2025-12-04", "https://example.com/test1.pdf");
      manager.insertRecord("2025-12-03", "https://example.com/test2.pdf");
      manager.insertRecord("2025-12-05", "https://example.com/test3.pdf");

      const records = manager.getAllRecords();
      expect(records).toHaveLength(3);
      expect(records.map((record) => record.date)).toEqual([
        "2025-12-05",
        "2025-12-04",
        "2025-12-03",
      ]);
    });
  });

  it("tracks pending pdf downloads and failures", () => {
    const db = createManager();
    db.using((manager) => {
      manager.initializeTables();
      const id1 = manager.insertRecord("2025-12-04", "https://example.com/a.pdf")!;
      const id2 = manager.insertRecord("2025-12-03", "https://example.com/b.pdf")!;
      const id3 = manager.insertRecord("2025-12-02", "https://example.com/c.pdf")!;

      manager.upsertPdfDownloaded(id1, "2025-12-04", Buffer.from("%PDF-a"), 5, 1);
      manager.markPdfFailed(id2, 3, "404");

      const pending = manager.getPendingPdfDownloads();
      expect(pending).toHaveLength(1);
      expect(pending[0]?.id).toBe(id3);
      expect(pending[0]?.date).toBe("2025-12-02");
    });
  });

  it("stores downloaded pdfs on disk", () => {
    const db = createManager();
    db.using((manager) => {
      manager.initializeTables();
      const rowId = manager.insertRecord("2025-12-04", "https://example.com/a.pdf")!;
      const content = Buffer.from("%PDF-1.4 test");
      manager.upsertPdfDownloaded(rowId, "2025-12-04", content, content.length, 2);

      const pdfPath = join(pdfDir, "2025-12-04.pdf");
      expect(existsSync(pdfPath)).toBe(true);
      expect(readFileSync(pdfPath).equals(content)).toBe(true);

      const pending = manager.getPendingPdfExtractions();
      expect(pending).toHaveLength(1);
      expect(manager.readDownloadedPdf("2025-12-04").equals(content)).toBe(true);
    });
  });

  it("clears failed downloads for retry", () => {
    const db = createManager();
    db.using((manager) => {
      manager.initializeTables();
      const rowId = manager.insertRecord("2025-12-04", "https://example.com/a.pdf")!;
      manager.markPdfFailed(rowId, 3, "boom");

      expect(manager.getPendingPdfDownloads()).toEqual([]);
      expect(manager.clearFailedPdfDownloads()).toBe(1);
      expect(manager.getPendingPdfDownloads()).toHaveLength(1);
    });
  });

  it("tracks extract status and pending extractions", () => {
    const db = createManager();
    db.using((manager) => {
      manager.initializeTables();
      const rowId = manager.insertRecord("2025-12-04", "https://example.com/a.pdf")!;
      const content = Buffer.from("%PDF-1.4 test");
      manager.upsertPdfDownloaded(rowId, "2025-12-04", content, content.length, 1);

      expect(manager.getPendingPdfExtractions()).toHaveLength(1);

      manager.saveExtractedRows(rowId, [
        {
          isin: "BG1100003166",
          issuer_name: "Test Issuer",
          total_shares: 100,
          free_float: 50,
          shareholders: 10,
        },
      ]);
      manager.markPdfExtracted(rowId, 1);

      expect(manager.getPendingPdfExtractions()).toEqual([]);
    });
  });

  it("clears failed extractions for retry", () => {
    const db = createManager();
    db.using((manager) => {
      manager.initializeTables();
      const rowId = manager.insertRecord("2025-12-04", "https://example.com/a.pdf")!;
      manager.upsertPdfDownloaded(rowId, "2025-12-04", Buffer.from("%PDF"), 4, 1);
      manager.markPdfExtractFailed(rowId, 1, "parse fail");

      expect(manager.getPendingPdfExtractions()).toEqual([]);
      expect(manager.clearFailedPdfExtractions()).toBe(1);
      expect(manager.getPendingPdfExtractions()).toHaveLength(1);
    });
  });

  it("flags mutations on writes but not on initialize or duplicate insert", () => {
    const db = createManager();
    db.using((manager) => {
      manager.initializeTables();
      expect(manager.hasMutations).toBe(false);

      expect(manager.insertRecord("2025-12-04", "https://example.com/a.pdf")).not.toBeNull();
      expect(manager.hasMutations).toBe(true);

      manager.clearMutations();
      expect(manager.insertRecord("2025-12-04", "https://example.com/a.pdf")).toBeNull();
      expect(manager.hasMutations).toBe(false);

      expect(manager.clearFailedPdfDownloads()).toBe(0);
      expect(manager.hasMutations).toBe(false);
    });
  });
});
