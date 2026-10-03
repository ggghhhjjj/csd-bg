import { tableFromIPC, CompressionType, compressionRegistry, type Table } from 'apache-arrow';
import lz4js from 'lz4js';

import type { ParsedDataset, VectorCatalogEntry, VectorManifest } from './vectors.types';

let compressionRegistered = false;

export function ensureLz4Compression(): void {
  if (compressionRegistered) {
    return;
  }
  compressionRegistry.set(CompressionType.LZ4_FRAME, {
    encode: (data: Uint8Array) => lz4js.compress(data),
    decode: (data: Uint8Array) => lz4js.decompress(data),
  });
  compressionRegistered = true;
}

function arrowDateToIso(value: number | Date | null | undefined): string {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  if (value === null || value === undefined) {
    throw new Error('Unexpected null date in dates.arrow');
  }
  const epochMs = value > 1_000_000_000_000 ? value : value * 86400000;
  return new Date(epochMs).toISOString().slice(0, 10);
}

function extractMetric(
  seriesTable: Table,
  column: string,
  issuerCount: number,
  dateCount: number,
): { values: Int32Array; valid: Uint8Array } {
  const values = new Int32Array(issuerCount * dateCount);
  const valid = new Uint8Array(issuerCount * dateCount);
  const child = seriesTable.getChild(column);
  if (!child) {
    throw new Error(`Missing column ${column}`);
  }
  for (let issuerIndex = 0; issuerIndex < issuerCount; issuerIndex += 1) {
    const list = child.get(issuerIndex);
    if (!list) {
      continue;
    }
    for (let dateIndex = 0; dateIndex < dateCount; dateIndex += 1) {
      const offset = issuerIndex * dateCount + dateIndex;
      if (list.isValid(dateIndex)) {
        valid[offset] = 1;
        values[offset] = list.get(dateIndex) as number;
      }
    }
  }
  return { values, valid };
}

export type VectorsParseInput = {
  manifest: VectorManifest;
  issuers: VectorCatalogEntry[];
  datesBuffer: ArrayBuffer | Uint8Array;
  seriesBuffer: ArrayBuffer | Uint8Array;
};

/** Parse Arrow IPC buffers into the in-memory chart dataset. */
export function parseVectorsDataset(input: VectorsParseInput): ParsedDataset {
  ensureLz4Compression();
  const datesTable = tableFromIPC(
    input.datesBuffer instanceof Uint8Array ? input.datesBuffer : new Uint8Array(input.datesBuffer),
  );
  const seriesTable = tableFromIPC(
    input.seriesBuffer instanceof Uint8Array ? input.seriesBuffer : new Uint8Array(input.seriesBuffer),
  );
  const dateColumn = datesTable.getChild('date');
  if (!dateColumn) {
    throw new Error('Missing date column');
  }
  const dates: string[] = [];
  for (let i = 0; i < datesTable.numRows; i += 1) {
    dates.push(arrowDateToIso(dateColumn.get(i) as number | Date));
  }
  const issuerCount = input.issuers.length;
  const dateCount = dates.length;
  const totalShares = extractMetric(seriesTable, 'total_shares', issuerCount, dateCount);
  const freeFloat = extractMetric(seriesTable, 'free_float', issuerCount, dateCount);
  const shareholders = extractMetric(seriesTable, 'shareholders', issuerCount, dateCount);
  return {
    generatedAt: input.manifest.generated_at,
    dates,
    issuers: input.issuers,
    totalShares: totalShares.values,
    freeFloat: freeFloat.values,
    shareholders: shareholders.values,
    totalSharesValid: totalShares.valid,
    freeFloatValid: freeFloat.valid,
    shareholdersValid: shareholders.valid,
  };
}
