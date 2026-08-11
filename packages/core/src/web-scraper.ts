import * as cheerio from "cheerio";
import { XMLParser } from "fast-xml-parser";

import { WebScraperError } from "./errors.js";
import { baseUrlFromStatisticsUrl, resolveStatisticsUrl } from "./settings.js";
import type { FreeFloatLink } from "./types.js";
import type { FetchLike } from "./pdf-downloader.js";

export class WebScraper {
  static readonly HREF_PATTERN = "/ffloat/FREE_FLOAT";
  static readonly DATE_PATTERN = /FREE_FLOAT_(\d{8})\.pdf/;
  static readonly FORM_ID = "formFF:j_idt46";
  static readonly FORM_NAME = "formFF";

  readonly statisticsUrl: string;
  readonly baseUrl: string;
  readonly timeout: number;
  private readonly fetchImpl: FetchLike;
  private readonly cookieJar = new Map<string, string>();

  constructor(options: {
    timeout?: number;
    statisticsUrl?: string;
    fetchImpl?: FetchLike;
  } = {}) {
    this.statisticsUrl = resolveStatisticsUrl(options.statisticsUrl);
    this.baseUrl = baseUrlFromStatisticsUrl(this.statisticsUrl);
    this.timeout = options.timeout ?? 30;
    this.fetchImpl = options.fetchImpl ?? this.defaultFetch.bind(this);
  }

  private defaultFetch(url: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers ?? {});
    if (!headers.has("User-Agent")) {
      headers.set(
        "User-Agent",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0.1 Safari/605.1.15",
      );
    }
    if (!headers.has("Accept-Language")) {
      headers.set("Accept-Language", "en-US,en;q=0.9");
    }

    const cookieHeader = [...this.cookieJar.entries()]
      .map(([key, value]) => `${key}=${value}`)
      .join("; ");
    if (cookieHeader) {
      headers.set("Cookie", cookieHeader);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout * 1000);

    return fetch(url, { ...init, headers, signal: controller.signal })
      .then((response) => {
        const setCookie = response.headers.get("set-cookie");
        if (setCookie) {
          for (const part of setCookie.split(",")) {
            const [pair] = part.split(";");
            const [name, value] = pair.split("=");
            if (name && value !== undefined) {
              this.cookieJar.set(name.trim(), value.trim());
            }
          }
        }
        return response;
      })
      .finally(() => clearTimeout(timeoutId));
  }

  private async fetchText(url: string, init?: RequestInit): Promise<string> {
    try {
      const response = await this.fetchImpl(url, init);
      if (!response.ok) {
        throw new WebScraperError(
          `Failed to fetch page ${url}: HTTP ${response.status} ${response.statusText}`,
        );
      }
      return await (response.text?.() ?? Promise.resolve(""));
    } catch (error) {
      if (error instanceof WebScraperError) {
        throw error;
      }
      throw new WebScraperError(
        `Failed to fetch page ${url}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async fetchPage(url?: string): Promise<string> {
    return this.fetchText(url ?? this.statisticsUrl);
  }

  extractFreeFloatLinks(htmlContent: string): FreeFloatLink[] {
    return this.extractLinksFromHtml(htmlContent);
  }

  private extractLinksFromHtml(htmlContent: string): FreeFloatLink[] {
    const $ = cheerio.load(htmlContent);
    const links: FreeFloatLink[] = [];

    $("a[href]").each((_, element) => {
      const href = $(element).attr("href") ?? "";
      if (!href.includes(WebScraper.HREF_PATTERN)) {
        return;
      }

      const match = href.match(WebScraper.DATE_PATTERN);
      if (!match) {
        return;
      }

      const dateStr = match[1];
      const year = dateStr.slice(0, 4);
      const month = dateStr.slice(4, 6);
      const day = dateStr.slice(6, 8);
      const formattedDate = `${year}-${month}-${day}`;

      if (Number.isNaN(Date.parse(formattedDate))) {
        return;
      }

      links.push({
        date: formattedDate,
        url: `${this.baseUrl}${href}`,
        href,
      });
    });

    return links;
  }

  async scrape(): Promise<FreeFloatLink[]> {
    const htmlContent = await this.fetchPage();
    return this.extractFreeFloatLinks(htmlContent);
  }

  extractFormParams(htmlContent: string): { viewState: string; nonce: string } {
    const $ = cheerio.load(htmlContent);
    const viewState = $('input[name="javax.faces.ViewState"]').attr("value");
    if (!viewState) {
      throw new WebScraperError("Failed to extract ViewState from page");
    }

    const nonce = $("script[nonce]").first().attr("nonce");
    if (!nonce) {
      throw new WebScraperError("Failed to extract nonce from page");
    }

    return { viewState, nonce };
  }

  parseAjaxResponse(xmlContent: string): { links: FreeFloatLink[]; viewState: string | null } {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
    });

    let parsed: unknown;
    try {
      parsed = parser.parse(xmlContent);
    } catch (error) {
      throw new WebScraperError(
        `Failed to parse XML response: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const links: FreeFloatLink[] = [];
    let updatedViewState: string | null = null;

    const collectUpdates = (node: unknown): void => {
      if (!node || typeof node !== "object") {
        return;
      }

      if (Array.isArray(node)) {
        for (const item of node) {
          collectUpdates(item);
        }
        return;
      }

      const record = node as Record<string, unknown>;
      if ("update" in record) {
        const updates = Array.isArray(record.update) ? record.update : [record.update];
        for (const update of updates) {
          if (!update || typeof update !== "object") {
            continue;
          }
          const updateRecord = update as Record<string, unknown>;
          const updateId = String(updateRecord["@_id"] ?? "");
          const text = String(updateRecord["#text"] ?? updateRecord["text"] ?? "");

          if (updateId.includes("j_idt46") && !updateId.includes("ViewState")) {
            links.push(...this.extractLinksFromHtml(text));
          } else if (updateId.includes("ViewState")) {
            updatedViewState = text.trim();
          }
        }
      }

      for (const value of Object.values(record)) {
        collectUpdates(value);
      }
    };

    collectUpdates(parsed);
    return { links, viewState: updatedViewState };
  }

  async fetchPaginatedData(
    pageNumber: number,
    viewState: string,
    nonce: string,
    rowsPerPage = 10,
  ): Promise<{ links: FreeFloatLink[]; viewState: string | null }> {
    const firstIndex = (pageNumber - 1) * rowsPerPage;
    const formId = WebScraper.FORM_ID;
    const formName = WebScraper.FORM_NAME;

    const body = new URLSearchParams({
      "javax.faces.partial.ajax": "true",
      "javax.faces.source": formId,
      "javax.faces.partial.execute": formId,
      "javax.faces.partial.render": formId,
      [`${formId}_pagination`]: "true",
      [`${formId}_first`]: String(firstIndex),
      [`${formId}_rows`]: String(rowsPerPage),
      [formName]: formName,
      [formId]: "list",
      [`${formName}:j_idt44_collapsed`]: "false",
      "javax.faces.ViewState": viewState,
      "primefaces.nonce": nonce,
    });

    try {
      const xmlContent = await this.fetchText(this.statisticsUrl, {
        method: "POST",
        headers: {
          Accept: "application/xml, text/xml, */*; q=0.01",
          "Content-Type": "application/x-www-form-urlencoded",
          "X-Requested-With": "XMLHttpRequest",
          "Faces-Request": "partial/ajax",
        },
        body: body.toString(),
      });

      return this.parseAjaxResponse(xmlContent);
    } catch (error) {
      if (error instanceof WebScraperError) {
        throw error;
      }
      throw new WebScraperError(
        `Failed to fetch page ${pageNumber}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async scrapeWithPostPagination(maxPages?: number | null): Promise<FreeFloatLink[]> {
    const allLinks: FreeFloatLink[] = [];
    const htmlContent = await this.fetchPage();
    let { viewState, nonce } = this.extractFormParams(htmlContent);

    allLinks.push(...this.extractFreeFloatLinks(htmlContent));

    let pageNumber = 2;
    let emptyPagesCount = 0;
    const maxEmptyPages = 3;

    while (true) {
      if (maxPages && pageNumber > maxPages) {
        break;
      }

      try {
        const { links: pageLinks, viewState: updatedViewState } = await this.fetchPaginatedData(
          pageNumber,
          viewState,
          nonce,
        );

        if (updatedViewState) {
          viewState = updatedViewState;
        }

        if (pageLinks.length === 0) {
          emptyPagesCount += 1;
          if (emptyPagesCount >= maxEmptyPages) {
            break;
          }
        } else {
          emptyPagesCount = 0;
          allLinks.push(...pageLinks);
        }

        pageNumber += 1;
      } catch (error) {
        console.warn(
          `Warning: Error fetching page ${pageNumber}: ${error instanceof Error ? error.message : String(error)}`,
        );
        break;
      }
    }

    return allLinks;
  }
}
