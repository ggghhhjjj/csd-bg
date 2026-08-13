export const CSD_BG_STATISTICS_URL_ENV = "CSD_BG_STATISTICS_URL";

export const KNOWN_STEPS = ["scrape", "download", "extract"] as const;
export type PipelineStep = (typeof KNOWN_STEPS)[number];

export interface FreeFloatLink {
  date: string;
  url: string;
  href: string;
}

export interface ExtractedRow {
  isin: string;
  issuer_name: string;
  total_shares: number;
  free_float: number;
  shareholders: number;
}

export interface FreeFloatRecord {
  id?: number;
  date: string;
  url: string;
  created_at?: string;
}

export interface PendingPdfDownload {
  id: number;
  date: string;
  url: string;
}

export interface PendingPdfExtraction {
  free_float_id: number;
  date: string;
}

export interface AppOptions {
  csvPath?: string;
  pdfDir?: string;
  dbPath: string;
  timeout?: number;
  usePostPagination?: boolean;
  maxPages?: number | null;
  enableEarlyStopping?: boolean;
  earlyStoppingThreshold?: number;
  downloadRetries?: number;
  downloadRetryMin?: number;
  downloadRetryMax?: number;
  clearFailedDownloads?: boolean;
  clearFailedExtracts?: boolean;
  statisticsUrl?: string;
}

export interface ScrapeSummary {
  totalLinks: number;
  newRecords: number;
  skippedRecords: number;
}

export interface DownloadSummary {
  downloaded: number;
  failed: number;
}

export interface ExtractSummary {
  extracted: number;
  failed: number;
  rowsWritten: number;
}

export interface PipelineRunResult {
  exitCode: number;
  scrape?: ScrapeSummary;
  download?: DownloadSummary;
  extract?: ExtractSummary;
}

export interface Logger {
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
}

export const consoleLogger: Logger = {
  info: (message, ...args) => console.log(message, ...args),
  warn: (message, ...args) => console.warn(message, ...args),
  error: (message, ...args) => console.error(message, ...args),
  debug: (message, ...args) => console.debug(message, ...args),
};
