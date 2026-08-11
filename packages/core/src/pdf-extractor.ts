import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

import { PdfExtractorError } from "./errors.js";
import type { ExtractedRow } from "./types.js";

interface PositionedTextItem {
  str: string;
  x: number;
  y: number;
}

export class PdfExtractor {
  static readonly ISIN_PATTERN = /BG[A-Z0-9]{10}/;
  static readonly ROW_PATTERN =
    /^(?<name>.+?)\s+(?<isin>BG[A-Z0-9]{10})\s+(?<total_shares>\d+)\s+(?<free_float>\d+)\s+(?<shareholders>\d+)\s*$/;
  static readonly SKIP_PATTERN =
    /Страница|Емитент|Фрий\s*фл|Брой\s*емитенти|дата\s*:/i;

  async extract(pdfBytes: Buffer): Promise<ExtractedRow[]> {
    if (!pdfBytes.length) {
      throw new PdfExtractorError("PDF content is empty");
    }

    let text: string;
    try {
      text = await this.extractText(pdfBytes);
    } catch (error) {
      throw new PdfExtractorError(
        `Failed to open PDF: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const rows = this.parseText(text);
    if (rows.length === 0) {
      throw new PdfExtractorError("No free-float rows found in PDF");
    }

    return rows;
  }

  private async extractText(pdfBytes: Buffer): Promise<string> {
    const pdf = await getDocument({
      data: new Uint8Array(pdfBytes),
      useSystemFonts: true,
    }).promise;

    if (pdf.numPages === 0) {
      throw new PdfExtractorError("PDF has no pages");
    }

    const lines: string[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const items: PositionedTextItem[] = [];
      for (const item of content.items) {
        if (
          typeof item === "object" &&
          item !== null &&
          "str" in item &&
          typeof item.str === "string" &&
          item.str.trim()
        ) {
          items.push({
            str: item.str.trim(),
            x: item.transform[4],
            y: item.transform[5],
          });
        }
      }

      lines.push(...this.linesFromPageItems(items));
    }

    return lines.join("\n");
  }

  private linesFromPageItems(items: PositionedTextItem[]): string[] {
    const buckets = new Map<number, PositionedTextItem[]>();

    for (const item of items) {
      let bucketKey: number | null = null;
      for (const existingKey of buckets.keys()) {
        if (Math.abs(existingKey - item.y) <= 2) {
          bucketKey = existingKey;
          break;
        }
      }

      const key = bucketKey ?? item.y;
      const bucket = buckets.get(key) ?? [];
      bucket.push(item);
      buckets.set(key, bucket);
    }

    return [...buckets.entries()]
      .sort(([leftY], [rightY]) => rightY - leftY)
      .map(([, bucketItems]) =>
        bucketItems
          .sort((left, right) => left.x - right.x)
          .map((item) => item.str)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim(),
      )
      .filter(Boolean);
  }

  parseText(text: string): ExtractedRow[] {
    const rows: ExtractedRow[] = [];

    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.split(/\s+/).join(" ");
      if (!line || PdfExtractor.SKIP_PATTERN.test(line)) {
        continue;
      }

      const match = line.match(PdfExtractor.ROW_PATTERN);
      if (match?.groups) {
        rows.push({
          issuer_name: match.groups.name.trim(),
          isin: match.groups.isin,
          total_shares: Number.parseInt(match.groups.total_shares, 10),
          free_float: Number.parseInt(match.groups.free_float, 10),
          shareholders: Number.parseInt(match.groups.shareholders, 10),
        });
        continue;
      }

      if (
        rows.length > 0 &&
        !PdfExtractor.ISIN_PATTERN.test(line) &&
        /[A-Za-zА-Яа-я"""]/u.test(line)
      ) {
        const last = rows[rows.length - 1];
        last.issuer_name = `${last.issuer_name} ${line}`.trim().split(/\s+/).join(" ");
      }
    }

    return rows;
  }
}
