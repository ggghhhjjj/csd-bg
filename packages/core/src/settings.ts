import { dirname, join } from "node:path";

import { ScraperConfigError } from "./errors.js";
import { CSD_BG_STATISTICS_URL_ENV } from "./types.js";

export const PDF_DIR_ENV = "PDF_DIR";
export const CSV_PATH_ENV = "CSV_PATH";
export const VECTORS_DIR_ENV = "VECTORS_DIR";

export function baseUrlFromStatisticsUrl(statisticsUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(statisticsUrl);
  } catch {
    throw new ScraperConfigError(
      `${CSD_BG_STATISTICS_URL_ENV} must be an absolute URL with scheme and host`,
    );
  }
  if (!parsed.protocol || !parsed.host) {
    throw new ScraperConfigError(
      `${CSD_BG_STATISTICS_URL_ENV} must be an absolute URL with scheme and host`,
    );
  }
  return `${parsed.protocol}//${parsed.host}`;
}

export function resolveStatisticsUrl(explicitUrl?: string | null): string {
  const raw = (
    explicitUrl !== undefined && explicitUrl !== null
      ? explicitUrl
      : process.env[CSD_BG_STATISTICS_URL_ENV] ?? ""
  ).trim();

  if (!raw) {
    throw new ScraperConfigError(
      `${CSD_BG_STATISTICS_URL_ENV} is not set. ` +
        "Copy .env.example to .env and set the statistics page URL for scraping.",
    );
  }

  baseUrlFromStatisticsUrl(raw);
  return raw;
}

export function resolvePdfDir(explicitDir?: string | null, dbPath?: string): string {
  const raw = (
    explicitDir !== undefined && explicitDir !== null
      ? explicitDir
      : process.env[PDF_DIR_ENV] ?? ""
  ).trim();

  if (raw) {
    return raw;
  }

  if (!dbPath) {
    throw new ScraperConfigError(
      "PDF directory is not configured. Set PDF_DIR, pass --pdf-dir, or provide a database path.",
    );
  }

  return join(dirname(dbPath), "pdfs");
}

export function resolveCsvPath(explicitPath?: string | null, dbPath?: string): string {
  const raw = (
    explicitPath !== undefined && explicitPath !== null
      ? explicitPath
      : process.env[CSV_PATH_ENV] ?? ""
  ).trim();

  if (raw) {
    return raw;
  }

  if (!dbPath) {
    throw new ScraperConfigError(
      "CSV path is not configured. Set CSV_PATH, pass --csv, or provide a database path.",
    );
  }

  return join(dirname(dbPath), "free_float.csv");
}

export function resolveVectorsDir(explicitDir?: string | null, dbPath?: string): string {
  const raw = (
    explicitDir !== undefined && explicitDir !== null
      ? explicitDir
      : process.env[VECTORS_DIR_ENV] ?? ""
  ).trim();

  if (raw) {
    return raw;
  }

  if (!dbPath) {
    throw new ScraperConfigError(
      "Vectors directory is not configured. Set VECTORS_DIR, pass --vectors-dir, or provide a database path.",
    );
  }

  return join(dirname(dbPath), "vectors");
}
