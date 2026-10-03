import type { VectorCatalogEntry, VectorManifest, WorkerRequest } from './vectors.types';
import { parseVectorsDataset } from './vectors-parse';

addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  void (async () => {
    try {
      const manifest = JSON.parse(event.data.manifestText) as VectorManifest;
      const catalog = JSON.parse(event.data.catalogText) as { issuers: VectorCatalogEntry[] };
      const dataset = parseVectorsDataset({
        manifest,
        issuers: catalog.issuers,
        datesBuffer: event.data.datesBuffer,
        seriesBuffer: event.data.seriesBuffer,
      });
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
