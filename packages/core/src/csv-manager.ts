import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { CsvManagerError } from "./errors.js";
import type { FreeFloatRecord } from "./types.js";

export class CsvManager {
  static readonly FIELDNAMES = ["date", "url"] as const;

  constructor(private readonly csvPath: string) {
    this.ensureCsvDirectory();
  }

  private ensureCsvDirectory(): void {
    mkdirSync(dirname(this.csvPath), { recursive: true });
  }

  private fileExistsAndHasContent(): boolean {
    return existsSync(this.csvPath) && statSync(this.csvPath).size > 0;
  }

  initializeFile(): void {
    try {
      if (!this.fileExistsAndHasContent()) {
        writeFileSync(this.csvPath, "date,url\n", "utf-8");
      }
    } catch (error) {
      throw new CsvManagerError(
        `Failed to initialize CSV file: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  appendRecord(date: string, url: string): void {
    try {
      this.initializeFile();
      appendFileSync(this.csvPath, `${date},${url}\n`, "utf-8");
    } catch (error) {
      throw new CsvManagerError(
        `Failed to append record to CSV: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  readAllRecords(): FreeFloatRecord[] {
    if (!existsSync(this.csvPath)) {
      return [];
    }

    try {
      const content = readFileSync(this.csvPath, "utf-8");
      const lines = content.split(/\r?\n/).filter(Boolean);
      if (lines.length <= 1) {
        return [];
      }

      return lines.slice(1).map((line) => {
        const commaIndex = line.indexOf(",");
        const date = line.slice(0, commaIndex);
        const url = line.slice(commaIndex + 1);
        return { date, url };
      });
    } catch (error) {
      throw new CsvManagerError(
        `Failed to read CSV file: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  getRecordCount(): number {
    return this.readAllRecords().length;
  }
}
