import { readFileSync } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CsvManager } from "@csd-bg/core";

describe("CsvManager", () => {
  it("initializes and appends records", () => {
    const dir = mkdtempSync(join(tmpdir(), "csd-bg-csv-"));
    const csvPath = join(dir, "free_float.csv");
    const manager = new CsvManager(csvPath);

    manager.initializeFile();
    manager.appendRecord("2025-01-01", "https://example.test/a.pdf");
    manager.appendRecord("2025-01-02", "https://example.test/b.pdf");

    expect(manager.getRecordCount()).toBe(2);
    expect(manager.readAllRecords()).toEqual([
      { date: "2025-01-01", url: "https://example.test/a.pdf" },
      { date: "2025-01-02", url: "https://example.test/b.pdf" },
    ]);

    rmSync(dir, { recursive: true, force: true });
  });
});

describe("settings", () => {
  it("resolves statistics url from env", async () => {
    const { resolveStatisticsUrl, baseUrlFromStatisticsUrl } = await import("@csd-bg/core");
    process.env.CSD_BG_STATISTICS_URL = "https://example.test/members/memberStatistics.xhtml";
    expect(resolveStatisticsUrl()).toBe("https://example.test/members/memberStatistics.xhtml");
    expect(baseUrlFromStatisticsUrl(process.env.CSD_BG_STATISTICS_URL)).toBe("https://example.test");
    delete process.env.CSD_BG_STATISTICS_URL;
  });
});

describe("WebScraper", () => {
  it("extracts links from fixture html", async () => {
    const { WebScraper } = await import("@csd-bg/core");
    const html = readFileSync(
      join(process.cwd(), "tests/fixtures/csd_home.html"),
      "utf-8",
    );

    const scraper = new WebScraper({
      statisticsUrl: "https://example.test/members/memberStatistics.xhtml",
    });

    const links = scraper.extractFreeFloatLinks(html);
    expect(links.length).toBeGreaterThan(0);
    expect(links[0]).toMatchObject({
      date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      url: expect.stringContaining("FREE_FLOAT"),
      href: expect.stringContaining("/ffloat/FREE_FLOAT"),
    });
  });
});

describe("DatabaseManager", () => {
  it("creates schema and stores records", async () => {
    const { DatabaseManager } = await import("@csd-bg/core");
    const dir = mkdtempSync(join(tmpdir(), "csd-bg-db-"));
    const dbPath = join(dir, "free_float.db");
    const db = new DatabaseManager(dbPath);

    db.using((manager) => {
      manager.initializeTables();
      expect(manager.getRecordCount()).toBe(0);
      const id = manager.insertRecord("2025-12-04", "https://example.test/a.pdf");
      expect(id).toBeTypeOf("number");
      expect(manager.recordExists("2025-12-04")).toBe(true);
    });

    rmSync(dir, { recursive: true, force: true });
  });
});
