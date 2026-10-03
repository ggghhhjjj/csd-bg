import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseVectorsDataset } from './vectors-parse';
import type { ParsedDataset, VectorCatalogEntry, VectorManifest } from './vectors.types';

/** `data/vectors` at repo root; unit tests run with cwd = `web/`. */
const REPO_VECTORS_DIR = join(process.cwd(), '../data/vectors');

/** Parsed `data/vectors` snapshot from the repo (for integration tests). */
export function loadRepoVectorsDataset(): ParsedDataset {
  const manifest = JSON.parse(readFileSync(join(REPO_VECTORS_DIR, 'manifest.json'), 'utf8')) as VectorManifest;
  const catalog = JSON.parse(readFileSync(join(REPO_VECTORS_DIR, 'catalog.json'), 'utf8')) as {
    issuers: VectorCatalogEntry[];
  };
  const datesBuffer = readFileSync(join(REPO_VECTORS_DIR, 'dates.arrow'));
  const seriesBuffer = readFileSync(join(REPO_VECTORS_DIR, 'free_float_vectors.arrow'));
  return parseVectorsDataset({
    manifest,
    issuers: catalog.issuers,
    datesBuffer,
    seriesBuffer,
  });
}
