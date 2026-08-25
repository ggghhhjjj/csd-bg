import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WebScraper, WebScraperError } from "@csd-bg/core";

import { TEST_BASE_URL, TEST_STATISTICS_URL } from "./test-constants.js";

const SIMPLE_HTML = `
<html>
  <body>
    <a class="center-panel-right-13" href="/ffloat/FREE_FLOAT_20251204.pdf" target="_blank">
      Free Float за 2025-12-04
    </a>
    <a class="center-panel-right-13" href="/ffloat/FREE_FLOAT_20251203.pdf" target="_blank">
      Free Float за 2025-12-03
    </a>
    <a href="/other/document.pdf">Other Document</a>
    <a href="/ffloat/FREE_FLOAT_invalid.pdf">Invalid Date</a>
  </body>
</html>
`;

const SAMPLE_HTML_WITH_VIEWSTATE = `
<html>
  <head>
    <script nonce="MzQwOGQ0MjYtOWNkOC00YmQ5LTg1YWMtZTA2ZGNjNDgyZjQ5"></script>
  </head>
  <body>
    <form>
      <input type="hidden" name="javax.faces.ViewState"
             value="-2187822647981327038:2544928799145319437" />
    </form>
  </body>
</html>
`;

const SAMPLE_AJAX_RESPONSE = `<?xml version='1.0' encoding='UTF-8'?>
<partial-response id="j_id1">
  <changes>
    <update id="formFF:j_idt46">
      <![CDATA[<ul class="ui-dataview-list-container">
      <li class="ui-dataview-row">
        <a class="center-panel-right-13" href="/ffloat/FREE_FLOAT_20251205.pdf" target="_blank">
          Free Float за 2025-12-05
        </a>
      </li>
      <li class="ui-dataview-row">
        <a class="center-panel-right-13" href="/ffloat/FREE_FLOAT_20251204.pdf" target="_blank">
          Free Float за 2025-12-04
        </a>
      </li>
      </ul>]]>
    </update>
    <update id="j_id1:javax.faces.ViewState:0">
      <![CDATA[-2187822647981327038:9999999999999999999]]>
    </update>
  </changes>
</partial-response>`;

describe("WebScraper", () => {
  beforeEach(() => {
    process.env.CSD_BG_STATISTICS_URL = TEST_STATISTICS_URL;
  });

  afterEach(() => {
    delete process.env.CSD_BG_STATISTICS_URL;
  });

  it("initializes with configured timeout and urls", () => {
    const scraper = new WebScraper({ timeout: 10, statisticsUrl: TEST_STATISTICS_URL });
    expect(scraper.timeout).toBe(10);
    expect(scraper.baseUrl).toBe(TEST_BASE_URL);
    expect(scraper.statisticsUrl).toBe(TEST_STATISTICS_URL);
  });

  it("uses default timeout of 30", () => {
    const scraper = new WebScraper({ statisticsUrl: TEST_STATISTICS_URL });
    expect(scraper.timeout).toBe(30);
  });

  it("extracts free float links from simple html", () => {
    const scraper = new WebScraper({ statisticsUrl: TEST_STATISTICS_URL });
    const links = scraper.extractFreeFloatLinks(SIMPLE_HTML);

    expect(links).toHaveLength(2);
    expect(links[0]).toEqual({
      date: "2025-12-04",
      url: `${TEST_BASE_URL}/ffloat/FREE_FLOAT_20251204.pdf`,
      href: "/ffloat/FREE_FLOAT_20251204.pdf",
    });
    expect(links[1]).toEqual({
      date: "2025-12-03",
      url: `${TEST_BASE_URL}/ffloat/FREE_FLOAT_20251203.pdf`,
      href: "/ffloat/FREE_FLOAT_20251203.pdf",
    });
  });

  it("extracts links from real fixture html", () => {
    const scraper = new WebScraper({ statisticsUrl: TEST_STATISTICS_URL });
    const html = readFileSync(join(process.cwd(), "tests/fixtures/csd_home.html"), "utf-8");
    const links = scraper.extractFreeFloatLinks(html);

    expect(links.length).toBeGreaterThanOrEqual(10);
    expect(links[0]?.date).toBe("2025-12-04");
    expect(links[0]?.url).toBe(`${TEST_BASE_URL}/ffloat/FREE_FLOAT_20251204.pdf`);

    const dates = links.map((link) => link.date);
    expect(dates).toEqual([...dates].sort().reverse());

    for (const link of links) {
      expect(link.url.startsWith(`${TEST_BASE_URL}/ffloat/`)).toBe(true);
      expect(link.href.startsWith("/ffloat/FREE_FLOAT_")).toBe(true);
    }
  });

  it("returns empty list for empty or unrelated html", () => {
    const scraper = new WebScraper({ statisticsUrl: TEST_STATISTICS_URL });

    expect(scraper.extractFreeFloatLinks("<html><body></body></html>")).toEqual([]);
    expect(
      scraper.extractFreeFloatLinks(
        '<html><body><a href="/other/document.pdf">Other</a></body></html>',
      ),
    ).toEqual([]);
  });

  it("skips links with invalid date format", () => {
    const scraper = new WebScraper({ statisticsUrl: TEST_STATISTICS_URL });
    const html = `
      <html><body>
        <a href="/ffloat/FREE_FLOAT_invalid.pdf">Invalid</a>
        <a href="/ffloat/FREE_FLOAT_2025.pdf">Incomplete</a>
      </body></html>
    `;

    expect(scraper.extractFreeFloatLinks(html)).toEqual([]);
  });

  it("converts YYYYMMDD dates to ISO format", () => {
    const scraper = new WebScraper({ statisticsUrl: TEST_STATISTICS_URL });
    const links = scraper.extractFreeFloatLinks(
      '<a href="/ffloat/FREE_FLOAT_20251231.pdf">Test</a>',
    );

    expect(links).toHaveLength(1);
    expect(links[0]?.date).toBe("2025-12-31");
  });

  it("fetches page content via fetchImpl", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: { get: () => null },
      text: async () => "<html>Test</html>",
      arrayBuffer: async () => new ArrayBuffer(0),
    }));

    const scraper = new WebScraper({ timeout: 10, statisticsUrl: TEST_STATISTICS_URL, fetchImpl });
    const result = await scraper.fetchPage();

    expect(result).toBe("<html>Test</html>");
    expect(fetchImpl).toHaveBeenCalledWith(TEST_STATISTICS_URL, undefined);
  });

  it("raises WebScraperError on fetch failure", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("Network error");
    });

    const scraper = new WebScraper({ statisticsUrl: TEST_STATISTICS_URL, fetchImpl });

    await expect(scraper.fetchPage()).rejects.toThrow(WebScraperError);
    await expect(scraper.fetchPage()).rejects.toThrow(/Network error/);
  });

  it("scrapes by fetching and extracting links", async () => {
    const scraper = new WebScraper({ statisticsUrl: TEST_STATISTICS_URL });
    vi.spyOn(scraper, "fetchPage").mockResolvedValue(SIMPLE_HTML);

    const result = await scraper.scrape();

    expect(result).toHaveLength(2);
    expect(result[0]?.date).toBe("2025-12-04");
  });

  it("extracts ViewState and nonce from html", () => {
    const scraper = new WebScraper({ statisticsUrl: TEST_STATISTICS_URL });
    const params = scraper.extractFormParams(SAMPLE_HTML_WITH_VIEWSTATE);

    expect(params.viewState).toBe("-2187822647981327038:2544928799145319437");
    expect(params.nonce).toBe("MzQwOGQ0MjYtOWNkOC00YmQ5LTg1YWMtZTA2ZGNjNDgyZjQ5");
  });

  it("errors when ViewState or nonce is missing", () => {
    const scraper = new WebScraper({ statisticsUrl: TEST_STATISTICS_URL });

    expect(() => scraper.extractFormParams("<html><body>No ViewState</body></html>")).toThrow(
      /ViewState/,
    );
    expect(() =>
      scraper.extractFormParams(
        '<html><body><input type="hidden" name="javax.faces.ViewState" value="test123" /></body></html>',
      ),
    ).toThrow(/nonce/);
  });

  it("parses ajax xml responses", () => {
    const scraper = new WebScraper({ statisticsUrl: TEST_STATISTICS_URL });
    const { links, viewState } = scraper.parseAjaxResponse(SAMPLE_AJAX_RESPONSE);

    expect(links).toHaveLength(2);
    expect(links[0]?.date).toBe("2025-12-05");
    expect(links[0]?.url).toBe(`${TEST_BASE_URL}/ffloat/FREE_FLOAT_20251205.pdf`);
    expect(links[1]?.date).toBe("2025-12-04");
    expect(viewState).toBe("-2187822647981327038:9999999999999999999");
  });

  it("parses empty ajax responses", () => {
    const scraper = new WebScraper({ statisticsUrl: TEST_STATISTICS_URL });
    const xml = `<?xml version='1.0' encoding='UTF-8'?>
<partial-response id="j_id1">
  <changes>
    <update id="formFF:j_idt46">
      <![CDATA[<ul class="ui-dataview-list-container"></ul>]]>
    </update>
  </changes>
</partial-response>`;

    const { links, viewState } = scraper.parseAjaxResponse(xml);
    expect(links).toEqual([]);
    expect(viewState).toBeNull();
  });

  it("handles ajax xml without link updates", () => {
    const scraper = new WebScraper({ statisticsUrl: TEST_STATISTICS_URL });
    const { links, viewState } = scraper.parseAjaxResponse("<invalid>xml");
    expect(links).toEqual([]);
    expect(viewState).toBeNull();
  });

  it("posts pagination requests with expected form fields", async () => {
    const fetchImpl = vi.fn(async (_url, init) => ({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: { get: () => null },
      text: async () => SAMPLE_AJAX_RESPONSE,
      arrayBuffer: async () => new ArrayBuffer(0),
    }));

    const scraper = new WebScraper({ statisticsUrl: TEST_STATISTICS_URL, fetchImpl });
    const { links, viewState } = await scraper.fetchPaginatedData(
      2,
      "-2187822647981327038:2544928799145319437",
      "MzQwOGQ0MjYtOWNkOC00YmQ5LTg1YWMtZTA2ZGNjNDgyZjQ5",
    );

    expect(links).toHaveLength(2);
    expect(viewState).toBe("-2187822647981327038:9999999999999999999");

    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    const body = init.body?.toString() ?? "";
    expect(body).toContain("formFF%3Aj_idt46_first=10");
    expect(body).toContain("formFF%3Aj_idt46_rows=10");
    expect(body).toContain("javax.faces.ViewState");
    expect(body).toContain("primefaces.nonce");
  });

  it("scrapeWithPostPagination merges initial and paginated links", async () => {
    const scraper = new WebScraper({ statisticsUrl: TEST_STATISTICS_URL });
    vi.spyOn(scraper, "fetchPage").mockResolvedValue(SAMPLE_HTML_WITH_VIEWSTATE + SIMPLE_HTML);
    vi.spyOn(scraper, "fetchPaginatedData")
      .mockResolvedValueOnce({
        links: [
          {
            date: "2025-12-04",
            url: `${TEST_BASE_URL}/ffloat/FREE_FLOAT_20251204.pdf`,
            href: "/ffloat/FREE_FLOAT_20251204.pdf",
          },
        ],
        viewState: "next",
      })
      .mockResolvedValue({ links: [], viewState: null })
      .mockResolvedValue({ links: [], viewState: null })
      .mockResolvedValue({ links: [], viewState: null });

    const result = await scraper.scrapeWithPostPagination(5);

    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result[0]?.date).toBe("2025-12-04");
  });

  it("scrapeWithPostPagination honors maxPages", async () => {
    const scraper = new WebScraper({ statisticsUrl: TEST_STATISTICS_URL });
    vi.spyOn(scraper, "fetchPage").mockResolvedValue(SAMPLE_HTML_WITH_VIEWSTATE + SIMPLE_HTML);
    const fetchPaginated = vi
      .spyOn(scraper, "fetchPaginatedData")
      .mockResolvedValue({ links: [], viewState: null });

    await scraper.scrapeWithPostPagination(2);

    expect(fetchPaginated).toHaveBeenCalledTimes(1);
  });
});
