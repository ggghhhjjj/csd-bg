import { createLogger, FreeFloatScraperApp, isVerboseLogLevel, parseLogLevel, type PipelineStep } from "@csd-bg/core";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { applyStatisticsUrlEnv, getExtensionSettings, getResolvedPaths } from "./config.js";

export class PipelineRunner {
  private output: (line: string) => void;

  constructor(output: (line: string) => void) {
    this.output = output;
  }

  async run(steps: PipelineStep[]): Promise<number> {
    const settings = getExtensionSettings();
    const paths = getResolvedPaths();
    applyStatisticsUrlEnv(settings.statisticsUrl);

    mkdirSync(dirname(paths.dbPath), { recursive: true });
    if (isVerboseLogLevel(parseLogLevel(settings.logLevel))) {
      mkdirSync(dirname(paths.csvPath), { recursive: true });
    }
    mkdirSync(paths.pdfDir, { recursive: true });
    mkdirSync(dirname(paths.logPath), { recursive: true });

    const logLevel = parseLogLevel(settings.logLevel);
    const logger = createLogger({
      logPath: paths.logPath,
      level: logLevel,
      onLine: (line) => this.output(line),
    });

    const app = new FreeFloatScraperApp(
      {
        csvPath: paths.csvPath,
        exportCsv: isVerboseLogLevel(logLevel),
        dbPath: paths.dbPath,
        pdfDir: paths.pdfDir,
        timeout: settings.timeout,
        usePostPagination: settings.usePostPagination,
        maxPages: settings.maxPages,
        enableEarlyStopping: settings.enableEarlyStopping,
        earlyStoppingThreshold: settings.earlyStoppingThreshold,
        statisticsUrl: settings.statisticsUrl || undefined,
      },
      logger,
    );

    logger.info(`Starting pipeline: ${steps.join(",")}`);
    const result = await app.run(steps);

    logger.info(`Pipeline finished: steps=${steps.join(",")} exit=${result.exitCode}`);
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

    return result.exitCode;
  }
}

export function buildCronSnippet(): string {
  const paths = getResolvedPaths();
  return `# Run daily at 06:30 (Synology / Linux cron)
30 6 * * * cd /volume2/docker/csd-bg && docker compose run --rm csd-bg-scraper scrape,download,extract --log ${paths.logPath}

# Local Node CLI equivalent
# node packages/cli/dist/index.js scrape,download,extract --db ${paths.dbPath} --log ${paths.logPath}
# Verbose run (also writes free_float.csv):
# node packages/cli/dist/index.js scrape,download,extract --verbose --db ${paths.dbPath} --log ${paths.logPath}`;
}
