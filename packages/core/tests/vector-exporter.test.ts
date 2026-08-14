import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import lz4js from "lz4js";
import Database from "better-sqlite3";
import { CompressionType, compressionRegistry, tableFromIPC } from "apache-arrow";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DatabaseManager, VectorExporter } from "@csd-bg/core";

compressionRegistry.set(CompressionType.LZ4_FRAME, {
  encode: (data: Uint8Array) => lz4js.compress(data),
  decode: (data: Uint8Array) => lz4js.decompress(data),
});

const REPO_ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "../../..");
const REAL_DB_PATH = join(REPO_ROOT, "data/free_float.db");
const REAL_VECTORS_DIR = join(REPO_ROOT, "data/vectors");

interface DbTrendPoint {
  date: string;
  total_shares: number;
  free_float: number;
  shareholders: number;
}

interface RestoredTrendPoint {
  date: string;
  total_shares: number | null;
  free_float: number | null;
  shareholders: number | null;
}

function arrowDateToIso(value: number | Date | null | undefined): string {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  if (value === null || value === undefined) {
    throw new Error("Unexpected null date in dates.arrow");
  }
  // apache-arrow Date32 may surface epoch milliseconds, not day count
  const epochMs = value > 1_000_000_000_000 ? value : value * 86400000;
  return new Date(epochMs).toISOString().slice(0, 10);
}

function loadRestoredIssuerSeries(
  vectorsDir: string,
  stockIssueId: number,
): RestoredTrendPoint[] {
  const catalog = JSON.parse(readFileSync(join(vectorsDir, "catalog.json"), "utf8")) as {
    issuers: Array<{ id: number }>;
  };
  const rowIndex = catalog.issuers.findIndex((issuer) => issuer.id === stockIssueId);
  if (rowIndex < 0) {
    throw new Error(`stock_issue_id ${stockIssueId} not found in catalog`);
  }

  const datesTable = tableFromIPC(readFileSync(join(vectorsDir, "dates.arrow")));
  const seriesTable = tableFromIPC(readFileSync(join(vectorsDir, "free_float_vectors.arrow")));
  const dateColumn = datesTable.getChild("date");
  const totalShares = seriesTable.getChild("total_shares")?.get(rowIndex);
  const freeFloat = seriesTable.getChild("free_float")?.get(rowIndex);
  const shareholders = seriesTable.getChild("shareholders")?.get(rowIndex);

  if (!dateColumn || !totalShares || !freeFloat || !shareholders) {
    throw new Error("Missing expected columns in vector files");
  }

  const points: RestoredTrendPoint[] = [];
  for (let dateIndex = 0; dateIndex < datesTable.numRows; dateIndex += 1) {
    points.push({
      date: arrowDateToIso(dateColumn.get(dateIndex) as number | Date),
      total_shares: totalShares.isValid(dateIndex) ? (totalShares.get(dateIndex) as number) : null,
      free_float: freeFloat.isValid(dateIndex) ? (freeFloat.get(dateIndex) as number) : null,
      shareholders: shareholders.isValid(dateIndex)
        ? (shareholders.get(dateIndex) as number)
        : null,
    });
  }
  return points;
}

function queryDbTrendByStockIssueId(db: DatabaseManager, stockIssueId: number): DbTrendPoint[] {
  const catalogRow = db
    .queryVectorCatalog()
    .find((issuer) => issuer.id === stockIssueId);
  if (!catalogRow) {
    throw new Error(`stock_issue_id ${stockIssueId} not found in database catalog`);
  }
  return db.queryIssuerTrend(catalogRow.isin);
}

function vectorArtifactsExist(vectorsDir: string): boolean {
  return [
    join(vectorsDir, "catalog.json"),
    join(vectorsDir, "manifest.json"),
    join(vectorsDir, "dates.arrow"),
    join(vectorsDir, "free_float_vectors.arrow"),
  ].every((path) => existsSync(path));
}

describe("VectorExporter", () => {
  let tempDir: string;
  let dbPath: string;
  let vectorsDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "csd-bg-vectors-"));
    dbPath = join(tempDir, "test.db");
    vectorsDir = join(tempDir, "vectors");
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  function seedDatabase(): DatabaseManager {
    const db = new DatabaseManager(dbPath, join(tempDir, "pdfs"));
    db.using((manager) => {
      manager.initializeTables();
      const id1 = manager.insertRecord("2026-01-01", "https://example.com/1.pdf");
      const id2 = manager.insertRecord("2026-01-02", "https://example.com/2.pdf");
      const id3 = manager.insertRecord("2026-01-03", "https://example.com/3.pdf");
      if (id1 === null || id2 === null || id3 === null) {
        throw new Error("Failed to seed free_float rows");
      }

      manager.saveExtractedRows(id1, [
        {
          isin: "BG1100000001",
          issuer_name: "Issuer One",
          total_shares: 1000,
          free_float: 100,
          shareholders: 10,
        },
        {
          isin: "BG1100000002",
          issuer_name: "Issuer Two",
          total_shares: 2000,
          free_float: 200,
          shareholders: 20,
        },
      ]);
      manager.saveExtractedRows(id2, [
        {
          isin: "BG1100000001",
          issuer_name: "Issuer One Renamed",
          total_shares: 1100,
          free_float: 110,
          shareholders: 11,
        },
      ]);
      manager.saveExtractedRows(id3, [
        {
          isin: "BG1100000002",
          issuer_name: "Issuer Two",
          total_shares: 2200,
          free_float: 220,
          shareholders: 22,
        },
      ]);
    });
    db.connect();
    return db;
  }

  it("exports catalog, manifest, dates, and series artifacts", () => {
    const db = seedDatabase();
    try {
      const summary = new VectorExporter(db, vectorsDir).export();

      expect(summary.issuerCount).toBe(2);
      expect(summary.dateCount).toBe(3);
      expect(existsSync(summary.catalogPath)).toBe(true);
      expect(existsSync(summary.manifestPath)).toBe(true);
      expect(existsSync(summary.datesPath)).toBe(true);
      expect(existsSync(summary.outputPath)).toBe(true);
      expect(summary.bytesWritten).toBeGreaterThan(0);

      const catalog = JSON.parse(readFileSync(summary.catalogPath, "utf8")) as {
        issuer_count: number;
        issuers: Array<{ id: number; isin: string; name: string }>;
      };
      expect(catalog.issuer_count).toBe(2);
      expect(catalog.issuers.map((issuer) => issuer.id)).toEqual([1, 2]);
      expect(catalog.issuers[0].isin).toBe("BG1100000001");
      expect(catalog.issuers[0].name).toBe("Issuer One Renamed");

      const manifest = JSON.parse(readFileSync(summary.manifestPath, "utf8")) as {
        date_count: number;
        date_min: string;
        date_max: string;
        metrics: string[];
      };
      expect(manifest.date_count).toBe(3);
      expect(manifest.date_min).toBe("2026-01-01");
      expect(manifest.date_max).toBe("2026-01-03");
      expect(manifest.metrics).toEqual(["total_shares", "free_float", "shareholders"]);

      const datesTable = tableFromIPC(readFileSync(summary.datesPath));
      expect(datesTable.numRows).toBe(3);

      const seriesTable = tableFromIPC(readFileSync(summary.outputPath));
      expect(seriesTable.numRows).toBe(2);

      const issuerOne = seriesTable.getChild("total_shares")?.get(0);
      const issuerTwo = seriesTable.getChild("total_shares")?.get(1);
      expect(issuerOne?.get(0)).toBe(1000);
      expect(issuerOne?.get(1)).toBe(1100);
      expect(issuerOne?.isValid(2)).toBe(false);
      expect(issuerTwo?.get(0)).toBe(2000);
      expect(issuerTwo?.isValid(1)).toBe(false);
      expect(issuerTwo?.get(2)).toBe(2200);
    } finally {
      db.disconnect();
    }
  });

  it("exports successfully when stock_issue.id has gaps", () => {
    const db = seedDatabase();
    try {
      db.disconnect();
      const sqlite = new Database(dbPath);
      let newStockIssueId = 0;
      try {
        sqlite.exec(`
          DELETE FROM issuer WHERE stock_issue_id = 1;
          DELETE FROM stock_issue_daily WHERE stock_issue_id = 1;
          DELETE FROM stock_issue WHERE id = 1;
          INSERT INTO stock_issue (isin) VALUES ('BG1100000001');
        `);
        const row = sqlite
          .prepare("SELECT id FROM stock_issue WHERE isin = ?")
          .get("BG1100000001") as { id: number };
        newStockIssueId = row.id;
        sqlite
          .prepare(
            `INSERT INTO issuer (stock_issue_id, free_float_id, name) VALUES (?, ?, ?)`,
          )
          .run(newStockIssueId, 1, "Issuer One");
        sqlite
          .prepare(
            `INSERT INTO issuer (stock_issue_id, free_float_id, name) VALUES (?, ?, ?)`,
          )
          .run(newStockIssueId, 2, "Issuer One Renamed");
        sqlite
          .prepare(
            `INSERT INTO stock_issue_daily
             (stock_issue_id, free_float_id, total_shares, free_float, shareholders)
             VALUES (?, ?, ?, ?, ?)`,
          )
          .run(newStockIssueId, 1, 1000, 100, 10);
        sqlite
          .prepare(
            `INSERT INTO stock_issue_daily
             (stock_issue_id, free_float_id, total_shares, free_float, shareholders)
             VALUES (?, ?, ?, ?, ?)`,
          )
          .run(newStockIssueId, 2, 1100, 110, 11);
      } finally {
        sqlite.close();
      }
      db.connect();

      const summary = new VectorExporter(db, vectorsDir).export();

      const catalog = JSON.parse(readFileSync(summary.catalogPath, "utf8")) as {
        issuers: Array<{ id: number; isin: string }>;
      };
      expect(catalog.issuers.map((issuer) => issuer.id)).toEqual([2, newStockIssueId]);
      expect(newStockIssueId).toBe(3);

      const restored = loadRestoredIssuerSeries(vectorsDir, newStockIssueId);
      expect(restored.find((point) => point.date === "2026-01-01")?.total_shares).toBe(1000);
      expect(restored.find((point) => point.date === "2026-01-02")?.total_shares).toBe(1100);
      expect(restored.find((point) => point.date === "2026-01-03")?.total_shares).toBeNull();

      const seriesTable = tableFromIPC(readFileSync(summary.outputPath));
      const catalogRowIndex = catalog.issuers.findIndex((issuer) => issuer.id === newStockIssueId);
      expect(catalogRowIndex).toBe(1);
      const issuerOne = seriesTable.getChild("total_shares")?.get(catalogRowIndex);
      expect(issuerOne?.get(0)).toBe(1000);
      expect(issuerOne?.get(1)).toBe(1100);
    } finally {
      db.disconnect();
    }
  });
});

const realDataAvailable = existsSync(REAL_DB_PATH) && vectorArtifactsExist(REAL_VECTORS_DIR);

describe.skipIf(!realDataAvailable)("VectorExporter real data round-trip", () => {
  const stockIssueId = 1;

  it("matches database trend for stock_issue_id against data/vectors", () => {
    const db = new DatabaseManager(REAL_DB_PATH, join(REPO_ROOT, "data/pdfs"));
    db.connect();
    try {
      const dbTrend = queryDbTrendByStockIssueId(db, stockIssueId);
      expect(dbTrend.length).toBeGreaterThan(0);

      const restored = loadRestoredIssuerSeries(REAL_VECTORS_DIR, stockIssueId);
      const restoredByDate = new Map(restored.map((point) => [point.date, point]));

      for (const dbPoint of dbTrend) {
        const vectorPoint = restoredByDate.get(dbPoint.date);
        expect(vectorPoint, `missing date ${dbPoint.date} in vectors`).toBeDefined();
        expect(vectorPoint?.total_shares).toBe(dbPoint.total_shares);
        expect(vectorPoint?.free_float).toBe(dbPoint.free_float);
        expect(vectorPoint?.shareholders).toBe(dbPoint.shareholders);
      }

      for (const vectorPoint of restored) {
        const dbPoint = dbTrend.find((point) => point.date === vectorPoint.date);
        if (dbPoint) {
          continue;
        }
        expect(vectorPoint.total_shares).toBeNull();
        expect(vectorPoint.free_float).toBeNull();
        expect(vectorPoint.shareholders).toBeNull();
      }
    } finally {
      db.disconnect();
    }
  });
});
