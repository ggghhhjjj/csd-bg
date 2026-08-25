import { tableFromIPC, CompressionType, compressionRegistry, type Table } from 'apache-arrow';
import lz4js from 'lz4js';

import type { ParsedDataset, VectorCatalogEntry, VectorManifest, WorkerRequest } from './vectors.types';

let compressionRegistered = false;

function ensureLz4(): void {
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

addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  void (async () => {
    try {
      ensureLz4();
      const manifest = JSON.parse(event.data.manifestText) as VectorManifest;
      const catalog = JSON.parse(event.data.catalogText) as { issuers: VectorCatalogEntry[] };
      const datesTable = await Promise.resolve(tableFromIPC(new Uint8Array(event.data.datesBuffer)));
      const seriesTable = await Promise.resolve(tableFromIPC(new Uint8Array(event.data.seriesBuffer)));
      const dateColumn = datesTable.getChild('date');
      if (!dateColumn) {
        throw new Error('Missing date column');
      }
      const dates: string[] = [];
      for (let i = 0; i < datesTable.numRows; i += 1) {
        dates.push(arrowDateToIso(dateColumn.get(i) as number | Date));
      }
      const issuerCount = catalog.issuers.length;
      const dateCount = dates.length;
      const totalShares = extractMetric(seriesTable, 'total_shares', issuerCount, dateCount);
      const freeFloat = extractMetric(seriesTable, 'free_float', issuerCount, dateCount);
      const shareholders = extractMetric(seriesTable, 'shareholders', issuerCount, dateCount);
      const dataset: ParsedDataset = {
        generatedAt: manifest.generated_at,
        dates,
        issuers: catalog.issuers,
        totalShares: totalShares.values,
        freeFloat: freeFloat.values,
        shareholders: shareholders.values,
        totalSharesValid: totalShares.valid,
        freeFloatValid: freeFloat.valid,
        shareholdersValid: shareholders.valid,
      };
      const transfer = [
        dataset.totalShares.buffer,
        dataset.freeFloat.buffer,
        dataset.shareholders.buffer,
        dataset.totalSharesValid.buffer,
        dataset.freeFloatValid.buffer,
        dataset.shareholdersValid.buffer,
      ] as Transferable[];
      (self as DedicatedWorkerGlobalScope).postMessage(dataset, transfer);
    } catch (error) {
      (self as DedicatedWorkerGlobalScope).postMessage({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  })();
});
