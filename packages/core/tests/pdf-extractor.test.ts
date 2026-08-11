import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { PdfExtractor, PdfExtractorError } from "@csd-bg/core";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "../../../tests/fixtures");
const pdf20260723 = join(fixturesDir, "FREE_FLOAT_20260723.pdf");
const md20260723 = join(fixturesDir, "FREE_FLOAT_20260723.md");
const pdf20220104 = join(fixturesDir, "FREE_FLOAT_20220104.pdf");

function loadMarkdownRows(path: string) {
  const rows: Array<{
    issuer_name: string;
    isin: string;
    total_shares: number;
    free_float: number;
    shareholders: number;
  }> = [];

  for (const rawLine of readFileSync(path, "utf-8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line.startsWith("|")) {
      continue;
    }
    if (line.includes("Емитент") || /^\|\s*-+/.test(line)) {
      continue;
    }
    const parts = line
      .slice(1, -1)
      .split("|")
      .map((part) => part.trim());
    rows.push({
      issuer_name: parts[0],
      isin: parts[1],
      total_shares: Number.parseInt(parts[2], 10),
      free_float: Number.parseInt(parts[3], 10),
      shareholders: Number.parseInt(parts[4], 10),
    });
  }

  return rows;
}

describe("PdfExtractor", () => {
  const extractor = new PdfExtractor();

  it("rejects empty bytes", async () => {
    await expect(extractor.extract(Buffer.alloc(0))).rejects.toThrow(PdfExtractorError);
  });

  it("rejects invalid pdf", async () => {
    await expect(extractor.extract(Buffer.from("not a pdf"))).rejects.toThrow(PdfExtractorError);
  });

  it("matches golden markdown for 20260723", async () => {
    const expected = loadMarkdownRows(md20260723);
    const actual = await extractor.extract(readFileSync(pdf20260723));

    expect(actual.length).toBe(expected.length);

    const expectedByIsin = Object.fromEntries(expected.map((row) => [row.isin, row]));
    const actualByIsin = Object.fromEntries(actual.map((row) => [row.isin, row]));
    expect(Object.keys(actualByIsin).sort()).toEqual(Object.keys(expectedByIsin).sort());

    for (const [isin, expectedRow] of Object.entries(expectedByIsin)) {
      const actualRow = actualByIsin[isin];
      expect(actualRow.issuer_name).toBe(expectedRow.issuer_name);
      expect(actualRow.total_shares).toBe(expectedRow.total_shares);
      expect(actualRow.free_float).toBe(expectedRow.free_float);
      expect(actualRow.shareholders).toBe(expectedRow.shareholders);
    }
  });

  it("joins wrapped issuer names", async () => {
    const rows = await extractor.extract(readFileSync(pdf20260723));
    const byIsin = Object.fromEntries(rows.map((row) => [row.isin, row]));
    expect(byIsin.BG1100008157.issuer_name).toContain("Имоти");
  });

  it("tracks issuer rename across pdfs", async () => {
    const older = Object.fromEntries(
      (await extractor.extract(readFileSync(pdf20220104))).map((row) => [row.isin, row]),
    );
    const newer = Object.fromEntries(
      (await extractor.extract(readFileSync(pdf20260723))).map((row) => [row.isin, row]),
    );

    expect(older.BG1100003166.issuer_name).toBe("АЛТЕРКО АД");
    expect(newer.BG1100003166.issuer_name).toBe("ШЕЛЛИ ГРУП ЕД");
  });
});
