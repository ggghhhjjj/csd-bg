import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FreeFloatScraperApp } from "@csd-bg/core";
import type { FreeFloatLink } from "@csd-bg/core";

function makeLinks(count: number, startDay = 20): FreeFloatLink[] {
  return Array.from({ length: count }, (_, index) => {
    const day = startDay - index;
    return {
      date: `2025-12-${String(day).padStart(2, "0")}`,
      url: `https://example.com/test${day}.pdf`,
      href: `/ffloat/FREE_FLOAT_202512${String(day).padStart(2, "0")}.pdf`,
    };
  });
}

describe("early stopping", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "csd-bg-early-stop-"));
    process.env.CSD_BG_STATISTICS_URL = "https://example.test/members/memberStatistics.xhtml";
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    delete process.env.CSD_BG_STATISTICS_URL;
  });

  function createApp(options: {
    enableEarlyStopping?: boolean;
    earlyStoppingThreshold?: number;
  } = {}): FreeFloatScraperApp {
    return new FreeFloatScraperApp({
      csvPath: join(tempDir, "test.csv"),
      dbPath: join(tempDir, "test.db"),
      timeout: 10,
      enableEarlyStopping: options.enableEarlyStopping ?? true,
      earlyStoppingThreshold: options.earlyStoppingThreshold ?? 10,
    });
  }

  it("stops after default threshold when all records exist", () => {
    const app = createApp();
    const links = makeLinks(20);

    vi.spyOn(app.dbManager, "getRecordCount").mockReturnValue(5);
    vi.spyOn(app.dbManager, "recordExists").mockReturnValue(true);
    vi.spyOn(app.dbManager, "connect").mockImplementation(() => {});
    vi.spyOn(app.dbManager, "disconnect").mockImplementation(() => {});

    app.processLinks(links);

    expect(app.dbManager.recordExists).toHaveBeenCalledTimes(10);
    expect(app.newRecordsCount).toBe(0);
    expect(app.skippedRecordsCount).toBe(10);
  });

  it("respects custom early stopping threshold", () => {
    const app = createApp({ earlyStoppingThreshold: 5 });
    const links = makeLinks(20);

    vi.spyOn(app.dbManager, "getRecordCount").mockReturnValue(5);
    vi.spyOn(app.dbManager, "recordExists").mockReturnValue(true);
    vi.spyOn(app.dbManager, "connect").mockImplementation(() => {});
    vi.spyOn(app.dbManager, "disconnect").mockImplementation(() => {});

    app.processLinks(links);

    expect(app.dbManager.recordExists).toHaveBeenCalledTimes(5);
    expect(app.skippedRecordsCount).toBe(5);
  });

  it("does not early stop when disabled", () => {
    const app = createApp({ enableEarlyStopping: false });
    const links = makeLinks(20);

    vi.spyOn(app.dbManager, "getRecordCount").mockReturnValue(5);
    vi.spyOn(app.dbManager, "recordExists").mockReturnValue(true);
    vi.spyOn(app.dbManager, "connect").mockImplementation(() => {});
    vi.spyOn(app.dbManager, "disconnect").mockImplementation(() => {});

    app.processLinks(links);

    expect(app.dbManager.recordExists).toHaveBeenCalledTimes(20);
    expect(app.skippedRecordsCount).toBe(20);
  });

  it("resets duplicate counter when a new record is found", () => {
    const app = createApp();
    const links: FreeFloatLink[] = [
      { date: "2025-12-20", url: "https://example.com/test1.pdf", href: "/a.pdf" },
      { date: "2025-12-19", url: "https://example.com/test2.pdf", href: "/b.pdf" },
      { date: "2025-12-18", url: "https://example.com/test3.pdf", href: "/c.pdf" },
      { date: "2025-12-17", url: "https://example.com/test4.pdf", href: "/d.pdf" },
      { date: "2025-12-16", url: "https://example.com/test5.pdf", href: "/e.pdf" },
      { date: "2025-12-15", url: "https://example.com/test6.pdf", href: "/f.pdf" },
    ];

    vi.spyOn(app.dbManager, "getRecordCount").mockReturnValue(5);
    vi.spyOn(app.dbManager, "recordExists")
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true);
    vi.spyOn(app.dbManager, "insertRecord").mockReturnValue(99);
    vi.spyOn(app.csvManager!, "appendRecord").mockImplementation(() => {});
    vi.spyOn(app.dbManager, "connect").mockImplementation(() => {});
    vi.spyOn(app.dbManager, "disconnect").mockImplementation(() => {});

    app.processLinks(links);

    expect(app.dbManager.recordExists).toHaveBeenCalledTimes(6);
    expect(app.newRecordsCount).toBe(1);
    expect(app.skippedRecordsCount).toBe(5);
  });

  it("stops after new records followed by consecutive duplicates", () => {
    const app = createApp();
    const links: FreeFloatLink[] = [
      { date: "2025-12-20", url: "https://example.com/test1.pdf", href: "/a.pdf" },
      { date: "2025-12-19", url: "https://example.com/test2.pdf", href: "/b.pdf" },
      ...makeLinks(20, 18),
    ];

    vi.spyOn(app.dbManager, "getRecordCount").mockReturnValue(5);
    vi.spyOn(app.dbManager, "recordExists").mockImplementation((date) => {
      return date !== "2025-12-20" && date !== "2025-12-19";
    });
    vi.spyOn(app.dbManager, "insertRecord").mockReturnValue(1);
    vi.spyOn(app.csvManager!, "appendRecord").mockImplementation(() => {});
    vi.spyOn(app.dbManager, "connect").mockImplementation(() => {});
    vi.spyOn(app.dbManager, "disconnect").mockImplementation(() => {});

    app.processLinks(links);

    expect(app.dbManager.recordExists).toHaveBeenCalledTimes(12);
    expect(app.newRecordsCount).toBe(2);
    expect(app.skippedRecordsCount).toBe(10);
  });

  it("avoids unnecessary checks on large duplicate sets", () => {
    const app = createApp();
    const links = Array.from({ length: 100 }, (_, index) => ({
      date: `2025-${String(Math.floor(index / 30) + 1).padStart(2, "0")}-${String((index % 30) + 1).padStart(2, "0")}`,
      url: `https://example.com/test${index}.pdf`,
      href: `/ffloat/test${index}.pdf`,
    }));

    vi.spyOn(app.dbManager, "getRecordCount").mockReturnValue(5);
    vi.spyOn(app.dbManager, "recordExists").mockReturnValue(true);
    vi.spyOn(app.dbManager, "connect").mockImplementation(() => {});
    vi.spyOn(app.dbManager, "disconnect").mockImplementation(() => {});

    app.processLinks(links);

    expect(app.dbManager.recordExists).toHaveBeenCalledTimes(10);
    expect(app.skippedRecordsCount).toBe(10);
  });
});
