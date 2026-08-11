import { setTimeout as sleep } from "node:timers/promises";

import { PdfDownloaderError } from "./errors.js";

export interface FetchLikeResponse {
  ok: boolean;
  status: number;
  statusText: string;
  headers: { get(name: string): string | null };
  arrayBuffer(): Promise<ArrayBuffer>;
  text?(): Promise<string>;
}

export interface FetchLike {
  (url: string, init?: RequestInit): Promise<FetchLikeResponse>;
}

export class PdfDownloader {
  static readonly PDF_MAGIC = Buffer.from("%PDF");
  lastAttempts = 0;

  constructor(
    private readonly options: {
      timeout?: number;
      maxRetries?: number;
      retryMinSeconds?: number;
      retryMaxSeconds?: number;
      fetchImpl?: FetchLike;
    } = {},
  ) {
    const maxRetries = this.options.maxRetries ?? 3;
    const retryMin = this.options.retryMinSeconds ?? 10;
    const retryMax = this.options.retryMaxSeconds ?? 30;

    if (maxRetries < 1) {
      throw new Error("max_retries must be at least 1");
    }
    if (retryMin < 0 || retryMax < 0) {
      throw new Error("retry delay bounds must be non-negative");
    }
    if (retryMin > retryMax) {
      throw new Error("retry_min_seconds cannot exceed retry_max_seconds");
    }
  }

  private get timeout(): number {
    return this.options.timeout ?? 30;
  }

  private get maxRetries(): number {
    return this.options.maxRetries ?? 3;
  }

  private get retryMinSeconds(): number {
    return this.options.retryMinSeconds ?? 10;
  }

  private get retryMaxSeconds(): number {
    return this.options.retryMaxSeconds ?? 30;
  }

  private backoffSeconds(): number {
    return (
      this.retryMinSeconds +
      Math.random() * (this.retryMaxSeconds - this.retryMinSeconds)
    );
  }

  private validatePdfBytes(content: Buffer, contentType: string | null): void {
    if (!content.length) {
      throw new PdfDownloaderError("Downloaded content is empty");
    }

    const contentTypeLower = (contentType ?? "").toLowerCase();
    const looksLikePdfType = contentTypeLower ? contentTypeLower.includes("pdf") : false;
    const hasMagic = content.subarray(0, 4).equals(PdfDownloader.PDF_MAGIC);

    if (!hasMagic && !looksLikePdfType) {
      throw new PdfDownloaderError(
        `Downloaded content is not a PDF (content-type=${JSON.stringify(contentType)}, magic=${JSON.stringify(content.subarray(0, 8))})`,
      );
    }
    if (!hasMagic) {
      throw new PdfDownloaderError(
        `Downloaded content missing PDF magic header (content-type=${JSON.stringify(contentType)})`,
      );
    }
  }

  private async downloadOnce(url: string): Promise<Buffer> {
    const fetchImpl = this.options.fetchImpl ?? fetch;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout * 1000);

    try {
      const response = await fetchImpl(url, {
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0.1 Safari/605.1.15",
          Accept: "application/pdf,*/*",
        },
      });

      if (!response.ok) {
        throw new PdfDownloaderError(
          `Failed to download ${url}: HTTP ${response.status} ${response.statusText}`,
        );
      }

      const content = Buffer.from(await response.arrayBuffer());
      this.validatePdfBytes(content, response.headers.get("content-type"));
      return content;
    } catch (error) {
      if (error instanceof PdfDownloaderError) {
        throw error;
      }
      throw new PdfDownloaderError(
        `Failed to download ${url}: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async download(url: string): Promise<Buffer> {
    let lastError: Error | undefined;
    this.lastAttempts = 0;

    for (let attempt = 1; attempt <= this.maxRetries; attempt += 1) {
      this.lastAttempts = attempt;
      try {
        return await this.downloadOnce(url);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < this.maxRetries) {
          await sleep(this.backoffSeconds() * 1000);
        }
      }
    }

    throw new PdfDownloaderError(
      `Failed to download ${url} after ${this.maxRetries} attempts: ${lastError?.message ?? "unknown error"}`,
    );
  }
}
