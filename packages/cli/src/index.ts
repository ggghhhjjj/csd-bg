#!/usr/bin/env node
import { resolve } from "node:path";

import { config as loadEnv } from "dotenv";
import { Command } from "commander";

import {
  FreeFloatScraperApp,
  KNOWN_STEPS,
  PipelineError,
  createLogger,
  parseSteps,
  resolveLogLevel,
} from "@csd-bg/core";

loadEnv();

const DEFAULT_LOG_PATH = "/data/app.log";

export function buildProgram(): Command {
  const program = new Command();

  program
    .name("csd-bg")
    .description("CSD-BG Free Float pipeline - scrape, download, and extract PDF content")
    .version("2.0.0")
    .argument(
      "[steps]",
      `Comma-separated pipeline steps (default: scrape,download,extract; known: ${KNOWN_STEPS.join(", ")})`,
      "scrape,download,extract",
    )
    .option("--csv <path>", "Path to CSV file (required for scrape)")
    .requiredOption("--db <path>", "Path to SQLite database file")
    .option("--log <path>", "Application log file path", DEFAULT_LOG_PATH)
    .option("--log-level <level>", "Minimum log level (ERROR, WARN, INFO, DEBUG)")
    .option("--timeout <seconds>", "HTTP timeout in seconds", "30")
    .option("--no-pagination", "Scrape first page only")
    .option("--max-pages <n>", "Maximum pages when paginating")
    .option("--no-early-stopping", "Disable early stopping on consecutive duplicates")
    .option("--early-stopping-threshold <n>", "Consecutive duplicates before early stop", "10")
    .option("--download-retries <n>", "Maximum PDF download attempts", "3")
    .option("--download-retry-min <seconds>", "Minimum retry backoff", "10")
    .option("--download-retry-max <seconds>", "Maximum retry backoff", "30")
    .option("--clear-failed-downloads", "Clear failed download marks before download")
    .option("--clear-failed-extracts", "Clear failed extract marks before extract")
    .action(async (stepsArg: string, options) => {
      let parsedSteps;
      try {
        parsedSteps = parseSteps(stepsArg);
      } catch (error) {
        if (error instanceof PipelineError) {
          program.error(error.message);
        }
        throw error;
      }

      if (parsedSteps.includes("scrape") && !options.csv) {
        program.error("--csv is required when the scrape step is selected");
      }

      const downloadRetries = Number.parseInt(options.downloadRetries, 10);
      const downloadRetryMin = Number.parseInt(options.downloadRetryMin, 10);
      const downloadRetryMax = Number.parseInt(options.downloadRetryMax, 10);

      if (downloadRetries < 1) {
        program.error("--download-retries must be at least 1");
      }
      if (downloadRetryMin > downloadRetryMax) {
        program.error("--download-retry-min cannot exceed --download-retry-max");
      }

      let logLevel;
      try {
        logLevel = resolveLogLevel(options.logLevel, process.env.LOG_LEVEL);
      } catch (error) {
        program.error(error instanceof Error ? error.message : String(error));
      }

      const logger = createLogger({
        logPath: resolve(options.log),
        level: logLevel,
      });

      logger.info(`Starting pipeline: ${parsedSteps.join(",")}`);

      const app = new FreeFloatScraperApp(
        {
          csvPath: options.csv,
          dbPath: resolve(options.db),
          timeout: Number.parseInt(options.timeout, 10),
          usePostPagination: options.pagination !== false,
          maxPages: options.maxPages ? Number.parseInt(options.maxPages, 10) : null,
          enableEarlyStopping: options.earlyStopping !== false,
          earlyStoppingThreshold: Number.parseInt(options.earlyStoppingThreshold, 10),
          downloadRetries,
          downloadRetryMin,
          downloadRetryMax,
          clearFailedDownloads: Boolean(options.clearFailedDownloads),
          clearFailedExtracts: Boolean(options.clearFailedExtracts),
        },
        logger,
      );

      const result = await app.run(parsedSteps);

      logger.info(`Pipeline finished: steps=${parsedSteps.join(",")} exit=${result.exitCode}`);
      if (result.scrape) {
        logger.info(
          `Scrape: new=${result.scrape.newRecords} skipped=${result.scrape.skippedRecords}`,
        );
      }
      if (result.download) {
        logger.info(
          `Download: ok=${result.download.downloaded} failed=${result.download.failed}`,
        );
      }
      if (result.extract) {
        logger.info(
          `Extract: ok=${result.extract.extracted} failed=${result.extract.failed} rows=${result.extract.rowsWritten}`,
        );
      }

      process.exitCode = result.exitCode;
    });

  return program;
}

import { fileURLToPath } from "node:url";

export async function main(argv = process.argv): Promise<void> {
  await buildProgram().parseAsync(argv);
}

const entryFile = process.argv[1] ? fileURLToPath(import.meta.url) : "";
if (process.argv[1] && process.argv[1] === entryFile) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
