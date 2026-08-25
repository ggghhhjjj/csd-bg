import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { DatabaseManagerError } from "./errors.js";

export function resolvePdfPath(pdfDir: string, date: string): string {
  return join(pdfDir, `${date}.pdf`);
}

export function writePdf(pdfDir: string, date: string, content: Buffer): void {
  mkdirSync(pdfDir, { recursive: true });
  writeFileSync(resolvePdfPath(pdfDir, date), content);
}

export function readPdf(pdfDir: string, date: string): Buffer {
  const path = resolvePdfPath(pdfDir, date);
  if (!existsSync(path)) {
    throw new DatabaseManagerError(`PDF file not found: ${path}`);
  }
  return readFileSync(path);
}

export function deletePdf(pdfDir: string, date: string): void {
  const path = resolvePdfPath(pdfDir, date);
  if (existsSync(path)) {
    unlinkSync(path);
  }
}
