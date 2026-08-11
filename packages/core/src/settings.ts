import { ScraperConfigError } from "./errors.js";
import { CSD_BG_STATISTICS_URL_ENV } from "./types.js";

export function baseUrlFromStatisticsUrl(statisticsUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(statisticsUrl);
  } catch {
    throw new ScraperConfigError(
      `${CSD_BG_STATISTICS_URL_ENV} must be an absolute URL with scheme and host`,
    );
  }
  if (!parsed.protocol || !parsed.host) {
    throw new ScraperConfigError(
      `${CSD_BG_STATISTICS_URL_ENV} must be an absolute URL with scheme and host`,
    );
  }
  return `${parsed.protocol}//${parsed.host}`;
}

export function resolveStatisticsUrl(explicitUrl?: string | null): string {
  const raw = (
    explicitUrl !== undefined && explicitUrl !== null
      ? explicitUrl
      : process.env[CSD_BG_STATISTICS_URL_ENV] ?? ""
  ).trim();

  if (!raw) {
    throw new ScraperConfigError(
      `${CSD_BG_STATISTICS_URL_ENV} is not set. ` +
        "Copy .env.example to .env and set the statistics page URL for scraping.",
    );
  }

  baseUrlFromStatisticsUrl(raw);
  return raw;
}
