import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  FreeFloatScraperApp,
  PdfDownloaderError,
  PdfExtractorError,
  WebScraperError,
} from "@csd-bg/core";

describe("FreeFloatScraperApp", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "csd-bg-app-"));
    process.env.CSD_BG_STATISTICS_URL = "https://example.test/members/memberStatistics.xhtml";
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    delete process.env.CSD_BG_STATISTICS_URL;
  });

  function createApp(options: Record<string, unknown> = {}): FreeFloatScraperApp {
    return new FreeFloatScraperApp({
      csvPath: join(tempDir, "test.csv"),
      dbPath: join(tempDir, "test.db"),
      timeout: 10,
      ...options,
    });
  }

  it("initializes counters and paths", () => {
    const app = createApp();
    expect(app.newRecordsCount).toBe(0);
    expect(app.skippedRecordsCount).toBe(0);
    expect(app.downloadedCount).toBe(0);
  });

  it("processes new links", () => {
    const app = createApp();
    vi.spyOn(app.dbManager, "getRecordCount").mockReturnValue(0);
    vi.spyOn(app.dbManager, "recordExists").mockReturnValue(false);
    vi.spyOn(app.dbManager, "insertRecord").mockReturnValueOnce(1).mockReturnValueOnce(2);
    vi.spyOn(app.csvManager!, "appendRecord").mockImplementation(() => {});
    vi.spyOn(app.dbManager, "connect").mockImplementation(() => {});
    vi.spyOn(app.dbManager, "disconnect").mockImplementation(() => {});

    app.processLinks([
      { date: "2025-12-04", url: "https://example.com/test1.pdf", href: "/a.pdf" },
      { date: "2025-12-03", url: "https://example.com/test2.pdf", href: "/b.pdf" },
    ]);

    expect(app.newRecordsCount).toBe(2);
    expect(app.skippedRecordsCount).toBe(0);
    expect(app.csvManager!.appendRecord).toHaveBeenCalledTimes(2);
  });

  it("skips existing links", () => {
    const app = createApp();
    vi.spyOn(app.dbManager, "getRecordCount").mockReturnValue(1);
    vi.spyOn(app.dbManager, "recordExists").mockReturnValue(true);
    vi.spyOn(app.dbManager, "connect").mockImplementation(() => {});
    vi.spyOn(app.dbManager, "disconnect").mockImplementation(() => {});

    app.processLinks([
      { date: "2025-12-04", url: "https://example.com/test1.pdf", href: "/a.pdf" },
    ]);

    expect(app.newRecordsCount).toBe(0);
    expect(app.skippedRecordsCount).toBe(1);
  });

  it("runScrape returns 0 when links are found", async () => {
    const app = createApp();
    vi.spyOn(app, "setup").mockImplementation(() => {});
    vi.spyOn(app, "processLinks").mockImplementation(() => {
      app.newRecordsCount = 1;
    });

    const scraper = {
      scrapeWithPostPagination: vi.fn().mockResolvedValue([
        { date: "2025-12-04", url: "https://example.com/test1.pdf", href: "/a.pdf" },
      ]),
    };
    vi.spyOn(app as unknown as { getWebScraper: () => typeof scraper }, "getWebScraper").mockReturnValue(
      scraper,
    );

    const code = await app.runScrape();
    expect(code).toBe(0);
    expect(scraper.scrapeWithPostPagination).toHaveBeenCalled();
    expect(app.processLinks).toHaveBeenCalled();
  });

  it("runScrape returns 0 when no links are found", async () => {
    const app = createApp();
    vi.spyOn(app, "setup").mockImplementation(() => {});

    const scraper = {
      scrapeWithPostPagination: vi.fn().mockResolvedValue([]),
    };
    vi.spyOn(app as unknown as { getWebScraper: () => typeof scraper }, "getWebScraper").mockReturnValue(
      scraper,
    );

    const code = await app.runScrape();
    expect(code).toBe(0);
  });

  it("runScrape returns 1 on scraper errors", async () => {
    const app = createApp({ usePostPagination: false });
    vi.spyOn(app, "setup").mockImplementation(() => {});

    const scraper = {
      scrape: vi.fn().mockRejectedValue(new WebScraperError("Network error")),
      scrapeWithPostPagination: vi.fn(),
    };
    vi.spyOn(app as unknown as { getWebScraper: () => typeof scraper }, "getWebScraper").mockReturnValue(
      scraper,
    );

    const code = await app.runScrape();
    expect(code).toBe(1);
  });

  it("runDownload stores successes and marks failures", async () => {
    const app = createApp();
    vi.spyOn(app, "setup").mockImplementation(() => {});

    vi.spyOn(app.dbManager, "connect").mockImplementation(() => {});
    vi.spyOn(app.dbManager, "disconnect").mockImplementation(() => {});
    vi.spyOn(app.dbManager, "getPendingPdfDownloads").mockReturnValue([
      { id: 1, date: "2025-12-04", url: "https://example.com/ok.pdf" },
      { id: 2, date: "2025-12-03", url: "https://example.com/bad.pdf" },
    ]);
    vi.spyOn(app.dbManager, "upsertPdfDownloaded").mockImplementation(() => {});
    vi.spyOn(app.dbManager, "markPdfFailed").mockImplementation(() => {});

    vi.spyOn(app.pdfDownloader, "download")
      .mockResolvedValueOnce(Buffer.from("%PDF-ok"))
      .mockRejectedValueOnce(new PdfDownloaderError("404"));
    app.pdfDownloader.lastAttempts = 3;

    const code = await app.runDownload();

    expect(code).toBe(0);
    expect(app.downloadedCount).toBe(1);
    expect(app.downloadFailedCount).toBe(1);
    expect(app.dbManager.upsertPdfDownloaded).toHaveBeenCalledTimes(1);
    expect(app.dbManager.markPdfFailed).toHaveBeenCalledTimes(1);
  });

  it("runDownload clears failed marks when requested", async () => {
    const app = createApp({ clearFailedDownloads: true });
    vi.spyOn(app, "setup").mockImplementation(() => {});
    vi.spyOn(app.dbManager, "connect").mockImplementation(() => {});
    vi.spyOn(app.dbManager, "disconnect").mockImplementation(() => {});
    vi.spyOn(app.dbManager, "clearFailedPdfDownloads").mockReturnValue(2);
    vi.spyOn(app.dbManager, "getPendingPdfDownloads").mockReturnValue([]);

    const code = await app.runDownload();

    expect(code).toBe(0);
    expect(app.dbManager.clearFailedPdfDownloads).toHaveBeenCalled();
  });

  it("runExtract stores successes and marks failures", async () => {
    const app = createApp();
    vi.spyOn(app, "setup").mockImplementation(() => {});
    vi.spyOn(app.dbManager, "connect").mockImplementation(() => {});
    vi.spyOn(app.dbManager, "disconnect").mockImplementation(() => {});
    vi.spyOn(app.dbManager, "getPendingPdfExtractions").mockReturnValue([
      { free_float_id: 1, date: "2026-07-23", content: Buffer.from("%PDF-ok") },
      { free_float_id: 2, date: "2026-07-22", content: Buffer.from("%PDF-bad") },
    ]);
    vi.spyOn(app.dbManager, "saveExtractedRows").mockImplementation(() => {});
    vi.spyOn(app.dbManager, "markPdfExtracted").mockImplementation(() => {});
    vi.spyOn(app.dbManager, "markPdfExtractFailed").mockImplementation(() => {});

    vi.spyOn(app.pdfExtractor, "extract")
      .mockResolvedValueOnce([{ isin: "BG1100003166", issuer_name: "X", total_shares: 1, free_float: 1, shareholders: 1 }])
      .mockRejectedValueOnce(new PdfExtractorError("parse fail"));

    const code = await app.runExtract();

    expect(code).toBe(0);
    expect(app.extractedCount).toBe(1);
    expect(app.extractFailedCount).toBe(1);
    expect(app.dbManager.saveExtractedRows).toHaveBeenCalledTimes(1);
    expect(app.dbManager.markPdfExtracted).toHaveBeenCalledTimes(1);
    expect(app.dbManager.markPdfExtractFailed).toHaveBeenCalledTimes(1);
  });

  it("run executes pipeline steps in order", async () => {
    const app = createApp();
    const calls: string[] = [];

    vi.spyOn(app, "runScrape").mockImplementation(async () => {
      calls.push("scrape");
      return 0;
    });
    vi.spyOn(app, "runDownload").mockImplementation(async () => {
      calls.push("download");
      return 0;
    });
    vi.spyOn(app, "runExtract").mockImplementation(async () => {
      calls.push("extract");
      return 0;
    });

    const result = await app.run(["scrape", "download", "extract"]);

    expect(result.exitCode).toBe(0);
    expect(calls).toEqual(["scrape", "download", "extract"]);
  });
});
