import { afterEach, describe, expect, it, vi } from "vitest";

import { PdfDownloader, PdfDownloaderError } from "@csd-bg/core";
import type { FetchLike, FetchLikeResponse } from "@csd-bg/core";

const FAKE_PDF = Buffer.from("%PDF-1.4 fake content");

function makeResponse(options: {
  ok?: boolean;
  status?: number;
  statusText?: string;
  contentType?: string;
  body?: Buffer;
}): FetchLikeResponse {
  const body = options.body ?? FAKE_PDF;
  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    statusText: options.statusText ?? "OK",
    headers: {
      get: (name: string) =>
        name.toLowerCase() === "content-type" ? (options.contentType ?? "application/pdf") : null,
    },
    arrayBuffer: async () =>
      body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer,
  };
}

describe("PdfDownloader", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects invalid retry configuration", () => {
    expect(() => new PdfDownloader({ maxRetries: 0 })).toThrow(/max_retries/);
    expect(() =>
      new PdfDownloader({ retryMinSeconds: 30, retryMaxSeconds: 10 }),
    ).toThrow(/retry_min_seconds/);
  });

  it("downloads pdf bytes successfully", async () => {
    const fetchImpl = vi.fn(async () => makeResponse({})) as FetchLike;
    const downloader = new PdfDownloader({ fetchImpl, maxRetries: 3 });

    const content = await downloader.download("https://example.com/file.pdf");

    expect(content.equals(FAKE_PDF)).toBe(true);
    expect(downloader.lastAttempts).toBe(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("retries after failure then succeeds", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        makeResponse({ ok: false, status: 404, statusText: "Not Found" }),
      )
      .mockResolvedValueOnce(makeResponse({})) as FetchLike;

    const downloader = new PdfDownloader({
      fetchImpl,
      maxRetries: 3,
      retryMinSeconds: 0,
      retryMaxSeconds: 0,
    });

    const content = await downloader.download("https://example.com/file.pdf");

    expect(content.equals(FAKE_PDF)).toBe(true);
    expect(downloader.lastAttempts).toBe(2);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("exhausts retries on repeated failures", async () => {
    const fetchImpl = vi.fn(async () =>
      makeResponse({ ok: false, status: 404, statusText: "Not Found" }),
    ) as FetchLike;

    const downloader = new PdfDownloader({
      fetchImpl,
      maxRetries: 3,
      retryMinSeconds: 0,
      retryMaxSeconds: 0,
    });

    await expect(downloader.download("https://example.com/missing.pdf")).rejects.toThrow(
      /after 3 attempts/,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(downloader.lastAttempts).toBe(3);
  });

  it("rejects non-pdf bytes", async () => {
    const fetchImpl = vi.fn(async () =>
      makeResponse({
        body: Buffer.from("<html>not a pdf</html>"),
        contentType: "text/html",
      }),
    ) as FetchLike;

    const downloader = new PdfDownloader({ fetchImpl, maxRetries: 1 });

    await expect(downloader.download("https://example.com/file.pdf")).rejects.toThrow(
      PdfDownloaderError,
    );
  });

  it("retries on network errors", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network down");
    }) as FetchLike;

    const downloader = new PdfDownloader({
      fetchImpl,
      maxRetries: 2,
      retryMinSeconds: 0,
      retryMaxSeconds: 0,
    });

    await expect(downloader.download("https://example.com/file.pdf")).rejects.toThrow(
      PdfDownloaderError,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
