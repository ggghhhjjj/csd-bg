import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createLogger,
  isVerboseLogLevel,
  parseLogLevel,
  resolveLogLevel,
  type LogLevel,
} from "@csd-bg/core";

describe("parseLogLevel", () => {
  it("accepts valid levels case-insensitively", () => {
    expect(parseLogLevel("info")).toBe("INFO");
    expect(parseLogLevel("DEBUG")).toBe("DEBUG");
    expect(parseLogLevel("warn")).toBe("WARN");
    expect(parseLogLevel("error")).toBe("ERROR");
  });

  it("returns fallback for empty values", () => {
    expect(parseLogLevel(undefined)).toBe("INFO");
    expect(parseLogLevel("  ", "WARN")).toBe("WARN");
  });

  it("throws for invalid levels", () => {
    expect(() => parseLogLevel("trace")).toThrow(/Invalid log level/);
  });
});

describe("resolveLogLevel", () => {
  it("prefers CLI over env", () => {
    expect(resolveLogLevel("DEBUG", "ERROR")).toBe("DEBUG");
  });

  it("falls back to env then INFO", () => {
    expect(resolveLogLevel(undefined, "WARN")).toBe("WARN");
    expect(resolveLogLevel(undefined, undefined)).toBe("INFO");
  });
});

describe("isVerboseLogLevel", () => {
  it("returns true only for DEBUG", () => {
    expect(isVerboseLogLevel("DEBUG")).toBe(true);
    expect(isVerboseLogLevel("INFO")).toBe(false);
    expect(isVerboseLogLevel("WARN")).toBe(false);
    expect(isVerboseLogLevel("ERROR")).toBe(false);
  });
});

describe("createLogger", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "csd-bg-logger-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("filters messages by configured level", () => {
    const lines: string[] = [];
    const logger = createLogger({
      level: "WARN",
      onLine: (line) => lines.push(line),
    });

    logger.debug("debug message");
    logger.info("info message");
    logger.warn("warn message");
    logger.error("error message");

    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("WARN");
    expect(lines[1]).toContain("ERROR");
  });

  it("creates log file on first INFO write", () => {
    const logPath = join(tempDir, "nested", "app.log");
    const logger = createLogger({ logPath, level: "INFO" });

    logger.info("pipeline started");

    const contents = readFileSync(logPath, "utf-8");
    expect(contents).toContain("INFO");
    expect(contents).toContain("pipeline started");
  });

  it("emits all levels at DEBUG", () => {
    const levels: LogLevel[] = [];
    const logger = createLogger({
      level: "DEBUG",
      onLine: (_line, level) => levels.push(level),
    });

    logger.debug("d");
    logger.info("i");
    logger.warn("w");
    logger.error("e");

    expect(levels).toEqual(["DEBUG", "INFO", "WARN", "ERROR"]);
  });

  it("uses console when onLine is not provided", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const logger = createLogger({ level: "INFO" });

    logger.info("hello");

    expect(logSpy).toHaveBeenCalledOnce();
    logSpy.mockRestore();
  });
});
