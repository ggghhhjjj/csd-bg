import { workspace } from "vscode";
import { join } from "node:path";

export interface ResolvedPaths {
  dataDirectory: string;
  csvPath: string;
  dbPath: string;
  pdfDir: string;
  logPath: string;
}

export interface ExtensionSettings {
  statisticsUrl: string;
  timeout: number;
  maxPages: number | null;
  earlyStoppingThreshold: number;
  usePostPagination: boolean;
  enableEarlyStopping: boolean;
  logLevel: string;
}

export function getExtensionSettings(): ExtensionSettings {
  const config = workspace.getConfiguration("csd-bg");
  const maxPages = config.get<number>("maxPages", 0);

  return {
    statisticsUrl: config.get<string>("statisticsUrl", "").trim(),
    timeout: config.get<number>("timeout", 30),
    maxPages: maxPages > 0 ? maxPages : null,
    earlyStoppingThreshold: config.get<number>("earlyStoppingThreshold", 10),
    usePostPagination: config.get<boolean>("usePostPagination", true),
    enableEarlyStopping: config.get<boolean>("enableEarlyStopping", true),
    logLevel: config.get<string>("logLevel", "INFO"),
  };
}

export function getResolvedPaths(): ResolvedPaths {
  const config = workspace.getConfiguration("csd-bg");
  const dataDirectory = config.get<string>("dataDirectory", "./data");
  const csvFileName = config.get<string>("csvFileName", "free_float.csv");
  const dbFileName = config.get<string>("dbFileName", "free_float.db");

  const root = workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
  const absoluteDataDir = dataDirectory.startsWith("/")
    ? dataDirectory
    : join(root, dataDirectory);

  return {
    dataDirectory: absoluteDataDir,
    csvPath: join(absoluteDataDir, csvFileName),
    dbPath: join(absoluteDataDir, dbFileName),
    pdfDir: join(absoluteDataDir, "pdfs"),
    logPath: join(absoluteDataDir, "app.log"),
  };
}

export function applyStatisticsUrlEnv(statisticsUrl: string): void {
  if (statisticsUrl) {
    process.env.CSD_BG_STATISTICS_URL = statisticsUrl;
  }
}
