import { mkdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import lz4js from "lz4js";
import {
  CompressionType,
  DateDay,
  Field,
  FixedSizeList,
  Int32,
  Schema,
  Table,
  Vector,
  compressionRegistry,
  makeData,
  tableToIPC,
  vectorFromArray,
  type Data,
} from "apache-arrow";

import type { DatabaseManager } from "./database-manager.js";
import { VectorExporterError } from "./errors.js";
import type { Logger, VectorsSummary } from "./types.js";
import { consoleLogger } from "./types.js";

const MANIFEST_VERSION = 1;
const CATALOG_FILENAME = "catalog.json";
const MANIFEST_FILENAME = "manifest.json";
const DATES_FILENAME = "dates.arrow";
const SERIES_FILENAME = "free_float_vectors.arrow";

export interface VectorCatalogEntry {
  id: number;
  isin: string;
  name: string;
}

export interface VectorCatalog {
  version: number;
  issuer_count: number;
  issuers: VectorCatalogEntry[];
}

export interface VectorManifest {
  version: number;
  generated_at: string;
  issuer_count: number;
  date_count: number;
  date_min: string;
  date_max: string;
  catalog_file: string;
  dates_file: string;
  arrow_file: string;
  compression: string;
  metrics: string[];
  index_convention: string;
}

let compressionRegistered = false;

function ensureLz4Compression(): void {
  if (compressionRegistered) {
    return;
  }
  compressionRegistry.set(CompressionType.LZ4_FRAME, {
    encode: (data: Uint8Array) => lz4js.compress(data),
    decode: (data: Uint8Array) => lz4js.decompress(data),
  });
  compressionRegistered = true;
}

function writeJsonAtomic(path: string, value: unknown): void {
  const tempPath = `${path}.tmp`;
  writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  renameSync(tempPath, path);
}

function parseIsoDate(date: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function packNullableInt32(flat: Array<number | null>): Data {
  const innerType = new Int32();
  const len = flat.length;
  const values = new Int32Array(len);
  let nullCount = 0;
  const validity = new Uint8Array(Math.ceil(len / 8));
  validity.fill(255);

  for (let i = 0; i < len; i++) {
    const value = flat[i];
    if (value === null || value === undefined) {
      nullCount += 1;
      validity[i >> 3] &= ~(1 << (i & 7));
    } else {
      values[i] = value;
    }
  }

  return makeData({
    type: innerType,
    length: len,
    nullCount,
    nullBitmap: validity,
    data: values,
  }) as Data;
}

function makeFixedSizeListVector(
  rows: Array<Array<number | null>>,
  listSize: number,
): Vector {
  const listType = new FixedSizeList(listSize, new Field("item", new Int32(), true));
  return new Vector([
    makeData({
      type: listType,
      length: rows.length,
      nullCount: 0,
      child: packNullableInt32(rows.flat()),
    } as Parameters<typeof makeData>[0]),
  ]);
}

function buildSeriesTable(
  issuerCount: number,
  dateCount: number,
  grids: {
    total_shares: Array<Array<number | null>>;
    free_float: Array<Array<number | null>>;
    shareholders: Array<Array<number | null>>;
  },
): Table {
  const listType = new FixedSizeList(dateCount, new Field("item", new Int32(), true));
  const schema = new Schema([
    new Field("total_shares", listType, false),
    new Field("free_float", listType, false),
    new Field("shareholders", listType, false),
  ]);

  if (grids.total_shares.length !== issuerCount) {
    throw new VectorExporterError(
      `Series row count mismatch: expected ${issuerCount}, got ${grids.total_shares.length}`,
    );
  }

  return new Table(schema, {
    total_shares: makeFixedSizeListVector(grids.total_shares, dateCount),
    free_float: makeFixedSizeListVector(grids.free_float, dateCount),
    shareholders: makeFixedSizeListVector(grids.shareholders, dateCount),
  });
}

function buildDatesTable(dates: string[]): Table {
  const dateValues = dates.map(parseIsoDate);
  return new Table({
    date: vectorFromArray(dateValues, new DateDay()),
  });
}

function buildMetricGrids(
  issuerCount: number,
  dateCount: number,
  rows: Array<{
    stock_issue_id: number;
    total_shares: number | null;
    free_float: number | null;
    shareholders: number | null;
  }>,
): {
  total_shares: Array<Array<number | null>>;
  free_float: Array<Array<number | null>>;
  shareholders: Array<Array<number | null>>;
} {
  const total_shares = Array.from({ length: issuerCount }, () =>
    Array<number | null>(dateCount).fill(null),
  );
  const free_float = Array.from({ length: issuerCount }, () =>
    Array<number | null>(dateCount).fill(null),
  );
  const shareholders = Array.from({ length: issuerCount }, () =>
    Array<number | null>(dateCount).fill(null),
  );

  const expectedRows = issuerCount * dateCount;
  if (rows.length !== expectedRows) {
    throw new VectorExporterError(
      `Grid row count mismatch: expected ${expectedRows}, got ${rows.length}`,
    );
  }

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const issuerIndex = row.stock_issue_id - 1;
    const dateIndex = index % dateCount;

    if (issuerIndex < 0 || issuerIndex >= issuerCount) {
      throw new VectorExporterError(`Unexpected stock_issue_id: ${row.stock_issue_id}`);
    }

    total_shares[issuerIndex][dateIndex] = row.total_shares;
    free_float[issuerIndex][dateIndex] = row.free_float;
    shareholders[issuerIndex][dateIndex] = row.shareholders;
  }

  return { total_shares, free_float, shareholders };
}

export class VectorExporter {
  constructor(
    private readonly dbManager: DatabaseManager,
    private readonly outputDir: string,
    private readonly logger: Logger = consoleLogger,
  ) {}

  export(): VectorsSummary {
    ensureLz4Compression();
    mkdirSync(this.outputDir, { recursive: true });

    const catalogRows = this.dbManager.queryVectorCatalog();
    const dates = this.dbManager.queryVectorDates();
    const gridRows = this.dbManager.queryVectorGrid();

    if (catalogRows.length === 0) {
      throw new VectorExporterError("No stock issues found for vector export");
    }
    if (dates.length === 0) {
      throw new VectorExporterError("No report dates found for vector export");
    }

    for (let index = 0; index < catalogRows.length; index += 1) {
      const expectedId = index + 1;
      if (catalogRows[index].id !== expectedId) {
        throw new VectorExporterError(
          `Non-dense stock_issue.id sequence at index ${index}: expected ${expectedId}, got ${catalogRows[index].id}`,
        );
      }
    }

    const grids = buildMetricGrids(catalogRows.length, dates.length, gridRows);
    const datesTable = buildDatesTable(dates);
    const seriesTable = buildSeriesTable(catalogRows.length, dates.length, grids);

    const catalogPath = join(this.outputDir, CATALOG_FILENAME);
    const manifestPath = join(this.outputDir, MANIFEST_FILENAME);
    const datesPath = join(this.outputDir, DATES_FILENAME);
    const seriesPath = join(this.outputDir, SERIES_FILENAME);

    const catalog: VectorCatalog = {
      version: MANIFEST_VERSION,
      issuer_count: catalogRows.length,
      issuers: catalogRows.map((row) => ({
        id: row.id,
        isin: row.isin,
        name: row.name ?? "",
      })),
    };

    const manifest: VectorManifest = {
      version: MANIFEST_VERSION,
      generated_at: new Date().toISOString(),
      issuer_count: catalogRows.length,
      date_count: dates.length,
      date_min: dates[0],
      date_max: dates[dates.length - 1],
      catalog_file: CATALOG_FILENAME,
      dates_file: DATES_FILENAME,
      arrow_file: SERIES_FILENAME,
      compression: "LZ4_FRAME",
      metrics: ["total_shares", "free_float", "shareholders"],
      index_convention: "series_row_i maps to catalog.issuers[i].id",
    };

    writeJsonAtomic(catalogPath, catalog);
    writeJsonAtomic(manifestPath, manifest);

    const datesBytes = tableToIPC(datesTable, "file", CompressionType.LZ4_FRAME);
    const seriesBytes = tableToIPC(seriesTable, "file", CompressionType.LZ4_FRAME);
    writeFileSync(datesPath, datesBytes);
    writeFileSync(seriesPath, seriesBytes);

    const bytesWritten =
      statSync(catalogPath).size +
      statSync(manifestPath).size +
      statSync(datesPath).size +
      statSync(seriesPath).size;

    this.logger.info(
      `Vectors export complete: issuers=${catalogRows.length} dates=${dates.length} bytes=${bytesWritten}`,
    );

    return {
      issuerCount: catalogRows.length,
      dateCount: dates.length,
      outputPath: seriesPath,
      datesPath,
      catalogPath,
      manifestPath,
      bytesWritten,
    };
  }
}
