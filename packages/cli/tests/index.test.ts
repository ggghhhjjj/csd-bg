import { describe, expect, it, vi } from "vitest";

import { resolveLogLevel } from "@csd-bg/core";
import { buildProgram } from "../src/index.js";

describe("CLI log level", () => {
  it("exposes --log-level option", () => {
    const program = buildProgram();
    const optionNames = program.options.map((option) => option.long?.replace(/^--/, ""));

    expect(optionNames).toContain("log-level");
  });

  it("resolveLogLevel honors CLI override over env", () => {
    expect(resolveLogLevel("DEBUG", "ERROR")).toBe("DEBUG");
    expect(resolveLogLevel(undefined, "WARN")).toBe("WARN");
  });

  it("rejects invalid log level via parseLogLevel", async () => {
    const program = buildProgram();
    const errorSpy = vi.spyOn(program, "error").mockImplementation(() => {
      throw new Error("program.error");
    });

    await expect(
      program.parseAsync([
        "node",
        "csd-bg",
        "download",
        "--db",
        "./data/test.db",
        "--log-level",
        "trace",
      ]),
    ).rejects.toThrow("program.error");

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Invalid log level"));
    errorSpy.mockRestore();
  });
});
