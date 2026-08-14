import { CsvManager } from "./csv-manager.js";
import { DatabaseManager } from "./database-manager.js";
import {
  CsvManagerError,
  DatabaseManagerError,
  PdfExtractorError,
  ScraperConfigError,
  WebScraperError,
} from "./errors.js";
import { PdfDownloader } from "./pdf-downloader.js";
import { PdfExtractor } from "./pdf-extractor.js";
import { runPipeline } from "./pipeline.js";
import type {
  AppOptions,
  DownloadSummary,
  ExtractSummary,
  FreeFloatLink,
  Logger,
  PipelineRunResult,
  PipelineStep,
  ScrapeSummary,
} from "./types.js";
import { consoleLogger } from "./types.js";
import { resolveCsvPath, resolvePdfDir } from "./settings.js";
import { WebScraper } from "./web-scraper.js";

export class FreeFloatScraperApp {
  private scraper: WebScraper | null = null;

  newRecordsCount = 0;
  skippedRecordsCount = 0;
  downloadedCount = 0;
  downloadFailedCount = 0;
  extractedCount = 0;
  extractFailedCount = 0;
  extractRowsCount = 0;

  readonly dbManager: DatabaseManager;
  readonly csvManager: CsvManager | null;
  readonly pdfDownloader: PdfDownloader;
  readonly pdfExtractor: PdfExtractor;

  constructor(
    private readonly options: AppOptions,
    private readonly logger: Logger = consoleLogger,
  ) {
    this.dbManager = new DatabaseManager(
      options.dbPath,
      resolvePdfDir(options.pdfDir, options.dbPath),
    );
    this.csvManager =
      options.exportCsv === true
        ? new CsvManager(resolveCsvPath(options.csvPath, options.dbPath))
        : null;
    this.pdfDownloader = new PdfDownloader({
      timeout: options.timeout ?? 30,
      maxRetries: options.downloadRetries ?? 3,
      retryMinSeconds: options.downloadRetryMin ?? 10,
      retryMaxSeconds: options.downloadRetryMax ?? 30,
    });
    this.pdfExtractor = new PdfExtractor();
  }

  private getWebScraper(): WebScraper {
    if (!this.scraper) {
      this.scraper = new WebScraper({
        timeout: this.options.timeout ?? 30,
        statisticsUrl: this.options.statisticsUrl,
        logger: this.logger,
      });
    }
    return this.scraper;
  }

  setup(includeCsv = true): void {
    this.dbManager.using((db) => {
      db.initializeTables();
    });

    if (includeCsv && this.csvManager) {
      this.csvManager.initializeFile();
    }
  }

  processLinks(links: FreeFloatLink[]): void {
    let consecutiveDuplicates = 0;

    this.dbManager.connect();
    try {
      const recordCount = this.dbManager.getRecordCount();
      const databaseWasEmpty = recordCount === 0;

      for (let index = 0; index < links.length; index += 1) {
        const link = links[index];
        const { date, url } = link;

        if (this.dbManager.recordExists(date)) {
          this.skippedRecordsCount += 1;
          consecutiveDuplicates += 1;

          if (
            (this.options.enableEarlyStopping ?? true) &&
            !databaseWasEmpty &&
            consecutiveDuplicates >= (this.options.earlyStoppingThreshold ?? 10)
          ) {
            this.logger.warn(
              `Early stopping after ${consecutiveDuplicates} consecutive duplicate records (threshold=${this.options.earlyStoppingThreshold ?? 10})`,
            );
            break;
          }
          continue;
        }

        consecutiveDuplicates = 0;
        const insertedId = this.dbManager.insertRecord(date, url);
        if (insertedId !== null) {
          this.csvManager?.appendRecord(date, url);
          this.newRecordsCount += 1;
        } else {
          this.skippedRecordsCount += 1;
        }
      }
    } finally {
      this.dbManager.disconnect();
    }
  }

  async runScrape(): Promise<number> {
    try {
      this.logger.info("Starting scrape");
      this.setup(true);

      const scraper = this.getWebScraper();
      const links =
        this.options.usePostPagination ?? true
          ? await scraper.scrapeWithPostPagination(this.options.maxPages ?? null)
          : await scraper.scrape();

      if (links.length === 0) {
        return 0;
      }

      this.processLinks(links);
      return 0;
    } catch (error) {
      if (
        error instanceof ScraperConfigError ||
        error instanceof WebScraperError ||
        error instanceof DatabaseManagerError ||
        error instanceof CsvManagerError
      ) {
        this.logger.error(error.message);
        return 1;
      }
      this.logger.error(`Unexpected error during scrape: ${String(error)}`);
      return 1;
    }
  }

  async runDownload(): Promise<number> {
    try {
      this.logger.info("Starting download");
      this.setup(false);

      this.dbManager.connect();
      try {
        if (this.options.clearFailedDownloads) {
          this.dbManager.clearFailedPdfDownloads();
        }

        const pending = this.dbManager.getPendingPdfDownloads();
        for (const record of pending) {
          try {
            const content = await this.pdfDownloader.download(record.url);
            this.dbManager.upsertPdfDownloaded(
              record.id,
              record.date,
              content,
              content.length,
              this.pdfDownloader.lastAttempts,
            );
            this.downloadedCount += 1;
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.dbManager.markPdfFailed(
              record.id,
              this.pdfDownloader.lastAttempts || (this.options.downloadRetries ?? 3),
              message,
            );
            this.downloadFailedCount += 1;
          }
        }
      } finally {
        this.dbManager.disconnect();
      }

      return 0;
    } catch (error) {
      if (error instanceof DatabaseManagerError) {
        this.logger.error(error.message);
        return 1;
      }
      this.logger.error(`Unexpected error during download: ${String(error)}`);
      return 1;
    }
  }

  async runExtract(): Promise<number> {
    try {
      this.logger.info("Starting extract");
      this.setup(false);

      this.dbManager.connect();
      try {
        if (this.options.clearFailedExtracts) {
          this.dbManager.clearFailedPdfExtractions();
        }

        const pending = this.dbManager.getPendingPdfExtractions();
        for (const record of pending) {
          try {
            const content = this.dbManager.readDownloadedPdf(record.date);
            const rows = await this.pdfExtractor.extract(content);
            this.dbManager.saveExtractedRows(record.free_float_id, rows);
            this.dbManager.markPdfExtracted(record.free_float_id, 1);
            this.extractedCount += 1;
            this.extractRowsCount += rows.length;
          } catch (error) {
            const message =
              error instanceof PdfExtractorError ? error.message : String(error);
            this.dbManager.markPdfExtractFailed(record.free_float_id, 1, message);
            this.extractFailedCount += 1;
          }
        }
      } finally {
        this.dbManager.disconnect();
      }

      return 0;
    } catch (error) {
      if (error instanceof DatabaseManagerError) {
        this.logger.error(error.message);
        return 1;
      }
      this.logger.error(`Unexpected error during extract: ${String(error)}`);
      return 1;
    }
  }

  async run(steps: PipelineStep[]): Promise<PipelineRunResult> {
    const exitCode = await runPipeline(steps, {
      scrape: () => this.runScrape(),
      download: () => this.runDownload(),
      extract: () => this.runExtract(),
    });

    const result: PipelineRunResult = { exitCode };
    if (steps.includes("scrape")) {
      result.scrape = this.getScrapeSummary();
    }
    if (steps.includes("download")) {
      result.download = this.getDownloadSummary();
    }
    if (steps.includes("extract")) {
      result.extract = this.getExtractSummary();
    }
    return result;
  }

  getScrapeSummary(): ScrapeSummary {
    return {
      totalLinks: this.newRecordsCount + this.skippedRecordsCount,
      newRecords: this.newRecordsCount,
      skippedRecords: this.skippedRecordsCount,
    };
  }

  getDownloadSummary(): DownloadSummary {
    return {
      downloaded: this.downloadedCount,
      failed: this.downloadFailedCount,
    };
  }

  getExtractSummary(): ExtractSummary {
    return {
      extracted: this.extractedCount,
      failed: this.extractFailedCount,
      rowsWritten: this.extractRowsCount,
    };
  }
}
