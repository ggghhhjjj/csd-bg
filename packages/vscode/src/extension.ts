import {
  commands,
  ExtensionContext,
  OutputChannel,
  TreeItem,
  Uri,
  window,
  workspace,
} from "vscode";

import {
  applyStatisticsUrlEnv,
  getExtensionSettings,
  getResolvedPaths,
} from "./config.js";
import { SqlJsBrowser } from "./db-browser.js";
import { PipelineRunner, buildCronSnippet } from "./pipeline-runner.js";
import { initSqlJsRuntime } from "./runtime.js";
import { DatesTreeProvider, IssuersTreeProvider } from "./tree-providers.js";
import {
  showCharts,
  showConfigEditor,
  showCronSnippet,
  showDataExplorer,
} from "./webviews.js";

let outputChannel: OutputChannel;
let dbBrowser: SqlJsBrowser | null = null;
let datesProvider: DatesTreeProvider;
let issuersProvider: IssuersTreeProvider;
let scheduleTimer: NodeJS.Timeout | null = null;

async function ensureBrowser(): Promise<SqlJsBrowser | null> {
  const paths = getResolvedPaths();
  try {
    await initSqlJsRuntime();
    if (!dbBrowser) {
      dbBrowser = new SqlJsBrowser();
    }
    await dbBrowser.open(paths.dbPath);
    return dbBrowser;
  } catch {
    return null;
  }
}

async function refreshTrees(): Promise<void> {
  await ensureBrowser();
  datesProvider.refresh();
  issuersProvider.refresh();
}

async function runPipelineSteps(steps: Array<"scrape" | "download" | "extract">): Promise<void> {
  const settings = getExtensionSettings();
  if (steps.includes("scrape") && !settings.statisticsUrl) {
    void window.showErrorMessage(
      "Set csd-bg.statisticsUrl before running scrape (CSD_BG_STATISTICS_URL).",
    );
    return;
  }

  applyStatisticsUrlEnv(settings.statisticsUrl);
  const runner = new PipelineRunner((line) => outputChannel.appendLine(line));
  outputChannel.show(true);

  await window.withProgress(
    {
      location: { viewId: "csd-bg.pipeline" },
      title: `CSD-BG: ${steps.join(", ")}`,
      cancellable: false,
    },
    async () => {
      const exitCode = await runner.run(steps);
      if (exitCode === 0) {
        void window.showInformationMessage(`CSD-BG pipeline finished: ${steps.join(", ")}`);
      } else {
        void window.showErrorMessage(`CSD-BG pipeline failed (exit ${exitCode}). See output.`);
      }
      await refreshTrees();
    },
  );
}

function registerScheduler(context: ExtensionContext): void {
  if (scheduleTimer) {
    clearInterval(scheduleTimer);
  }

  // Lightweight in-IDE scheduler while VS Code is open (hourly check placeholder).
  scheduleTimer = setInterval(() => {
    outputChannel.appendLine("CSD-BG scheduler tick (VS Code open). Use cron snippet for headless runs.");
  }, 60 * 60 * 1000);

  context.subscriptions.push({
    dispose: () => {
      if (scheduleTimer) {
        clearInterval(scheduleTimer);
      }
    },
  });
}

export async function activate(context: ExtensionContext): Promise<void> {
  outputChannel = window.createOutputChannel("CSD-BG");
  context.subscriptions.push(outputChannel);

  datesProvider = new DatesTreeProvider(() => dbBrowser);
  issuersProvider = new IssuersTreeProvider(() => dbBrowser);

  context.subscriptions.push(
    window.registerTreeDataProvider("csd-bg.dates", datesProvider),
    window.registerTreeDataProvider("csd-bg.issuers", issuersProvider),
    window.registerTreeDataProvider("csd-bg.pipeline", {
      getTreeItem: (element: TreeItem) => element,
      getChildren: () => [
        new TreeItem("Run full pipeline", undefined),
        new TreeItem("Data folder: " + getResolvedPaths().dataDirectory, undefined),
        new TreeItem("Log: " + getResolvedPaths().logPath, undefined),
      ],
    }),
  );

  context.subscriptions.push(
    commands.registerCommand("csd-bg.runPipeline", () =>
      runPipelineSteps(["scrape", "download", "extract"]),
    ),
    commands.registerCommand("csd-bg.runScrape", () => runPipelineSteps(["scrape"])),
    commands.registerCommand("csd-bg.runDownload", () => runPipelineSteps(["download"])),
    commands.registerCommand("csd-bg.runExtract", () => runPipelineSteps(["extract"])),
    commands.registerCommand("csd-bg.refreshDates", () => refreshTrees()),
    commands.registerCommand("csd-bg.openDataFolder", async () => {
      const paths = getResolvedPaths();
      await commands.executeCommand("revealFileInOS", Uri.file(paths.dataDirectory));
    }),
    commands.registerCommand("csd-bg.openDataExplorer", async () => {
      const browser = await ensureBrowser();
      const rows = browser?.queryDailyMetrics(300) ?? [];
      showDataExplorer(context, rows);
    }),
    commands.registerCommand("csd-bg.openCharts", async (item?: { isin?: string }) => {
      const isin =
        item?.isin ??
        (await window.showInputBox({ prompt: "Enter ISIN", value: "BG1100017174" }));
      if (!isin) {
        return;
      }
      const browser = await ensureBrowser();
      const points = browser?.queryIssuerTrend(isin) ?? [];
      showCharts(context, isin, points);
    }),
    commands.registerCommand("csd-bg.showIssuerTrend", async (item?: { isin?: string }) => {
      await commands.executeCommand("csd-bg.openCharts", item);
    }),
    commands.registerCommand("csd-bg.openConfigEditor", () => {
      const settings = getExtensionSettings();
      const paths = getResolvedPaths();
      showConfigEditor(
        context,
        {
          statisticsUrl: settings.statisticsUrl,
          dataDirectory: paths.dataDirectory,
          timeout: settings.timeout,
          earlyStoppingThreshold: settings.earlyStoppingThreshold,
          maxPages: settings.maxPages ?? 0,
          usePostPagination: settings.usePostPagination,
          enableEarlyStopping: settings.enableEarlyStopping,
        },
        async (updated) => {
          const config = workspace.getConfiguration("csd-bg");
          await config.update("statisticsUrl", updated.statisticsUrl, true);
          await config.update("dataDirectory", updated.dataDirectory, true);
          await config.update("timeout", updated.timeout, true);
          await config.update("earlyStoppingThreshold", updated.earlyStoppingThreshold, true);
          await config.update("maxPages", updated.maxPages, true);
          await config.update("usePostPagination", updated.usePostPagination, true);
          await config.update("enableEarlyStopping", updated.enableEarlyStopping, true);
        },
      );
    }),
    commands.registerCommand("csd-bg.generateCronSnippet", () => {
      showCronSnippet(context, buildCronSnippet());
    }),
  );

  registerScheduler(context);
  await refreshTrees();
}

export function deactivate(): void {
  void dbBrowser?.close();
}
