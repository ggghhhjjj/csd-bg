import { FreeFloatScraperApp, type PipelineStep } from "@csd-bg/core";
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
    mkdirSync(dirname(paths.csvPath), { recursive: true });

    const logger = {
      info: (message: string, ...args: unknown[]) =>
        this.output(`INFO  ${message} ${args.join(" ")}`.trim()),
      warn: (message: string, ...args: unknown[]) =>
        this.output(`WARN  ${message} ${args.join(" ")}`.trim()),
      error: (message: string, ...args: unknown[]) =>
        this.output(`ERROR ${message} ${args.join(" ")}`.trim()),
    };

    const app = new FreeFloatScraperApp(
      {
        csvPath: paths.csvPath,
        dbPath: paths.dbPath,
        timeout: settings.timeout,
        usePostPagination: settings.usePostPagination,
        maxPages: settings.maxPages,
        enableEarlyStopping: settings.enableEarlyStopping,
        earlyStoppingThreshold: settings.earlyStoppingThreshold,
        statisticsUrl: settings.statisticsUrl || undefined,
      },
      logger,
    );

    this.output(`Running pipeline: ${steps.join(",")}`);
    const result = await app.run(steps);

    if (result.scrape) {
      this.output(
        `Scrape: new=${result.scrape.newRecords}, skipped=${result.scrape.skippedRecords}`,
      );
    }
    if (result.download) {
      this.output(
        `Download: ok=${result.download.downloaded}, failed=${result.download.failed}`,
      );
    }
    if (result.extract) {
      this.output(
        `Extract: ok=${result.extract.extracted}, failed=${result.extract.failed}, rows=${result.extract.rowsWritten}`,
      );
    }

    return result.exitCode;
  }
}

export function buildCronSnippet(): string {
  const paths = getResolvedPaths();
  return `# Run daily at 06:30 (Synology / Linux cron)
30 6 * * * cd /volume2/docker/csd-bg && docker compose run --rm csd-bg-scraper scrape,download,extract >> ${paths.logPath} 2>&1

# Local Node CLI equivalent
# node packages/cli/dist/index.js scrape,download,extract --csv ${paths.csvPath} --db ${paths.dbPath} --log ${paths.logPath}`;
}
