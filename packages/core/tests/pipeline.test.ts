import { describe, expect, it } from "vitest";

import { PipelineError, parseSteps, runPipeline, KNOWN_STEPS } from "@csd-bg/core";

describe("parseSteps", () => {
  it("parses scrape,download,extract,vectors", () => {
    expect(parseSteps("scrape,download,extract,vectors")).toEqual([
      "scrape",
      "download",
      "extract",
      "vectors",
    ]);
  });

  it("parses single steps", () => {
    expect(parseSteps("download")).toEqual(["download"]);
    expect(parseSteps("scrape")).toEqual(["scrape"]);
    expect(parseSteps("extract")).toEqual(["extract"]);
    expect(parseSteps("vectors")).toEqual(["vectors"]);
  });

  it("trims whitespace", () => {
    expect(parseSteps(" scrape , download ")).toEqual(["scrape", "download"]);
  });

  it("preserves order", () => {
    expect(parseSteps("download,scrape")).toEqual(["download", "scrape"]);
  });

  it("rejects unknown steps", () => {
    expect(() => parseSteps("scrape,transform")).toThrow(PipelineError);
  });

  it("rejects empty input", () => {
    expect(() => parseSteps("")).toThrow(PipelineError);
    expect(() => parseSteps("   ")).toThrow(PipelineError);
    expect(() => parseSteps(",,")).toThrow(PipelineError);
  });

  it("rejects duplicate steps", () => {
    expect(() => parseSteps("scrape,scrape")).toThrow(/Duplicate/);
  });

  it("exports known steps", () => {
    expect(KNOWN_STEPS).toEqual(["scrape", "download", "extract", "vectors"]);
  });
});

describe("runPipeline", () => {
  it("runs handlers in order", async () => {
    const calls: string[] = [];
    const code = await runPipeline(["scrape", "download", "extract"], {
      scrape: async () => {
        calls.push("scrape");
        return 0;
      },
      download: async () => {
        calls.push("download");
        return 0;
      },
      extract: async () => {
        calls.push("extract");
        return 0;
      },
    });
    expect(code).toBe(0);
    expect(calls).toEqual(["scrape", "download", "extract"]);
  });

  it("stops on non-zero exit", async () => {
    const calls: string[] = [];
    const code = await runPipeline(["scrape", "download"], {
      scrape: async () => {
        calls.push("scrape");
        return 1;
      },
      download: async () => {
        calls.push("download");
        return 0;
      },
    });
    expect(code).toBe(1);
    expect(calls).toEqual(["scrape"]);
  });

  it("requires handlers", async () => {
    await expect(runPipeline(["scrape"], {})).rejects.toThrow(/No handler/);
  });
});
