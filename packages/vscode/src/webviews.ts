import { window, ViewColumn, type ExtensionContext } from "vscode";

import type { DailyMetricRow, IssuerTrendPoint } from "./db-browser.js";

function webviewHtml(title: string, body: string, scripts = ""): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline' https://cdn.jsdelivr.net;" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); margin: 0; padding: 16px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border-bottom: 1px solid var(--vscode-panel-border); padding: 6px 8px; text-align: left; }
    th { position: sticky; top: 0; background: var(--vscode-editor-background); }
    .toolbar { display: flex; gap: 8px; margin-bottom: 12px; align-items: center; }
    input, select, button, textarea { background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); padding: 6px 8px; }
    button { cursor: pointer; }
    .chart-wrap { max-width: 960px; height: 420px; }
    .muted { opacity: 0.75; }
    pre { white-space: pre-wrap; background: var(--vscode-textBlockQuote-background); padding: 12px; }
  </style>
</head>
<body>
${body}
${scripts}
</body>
</html>`;
}

export function showDataExplorer(context: ExtensionContext, rows: DailyMetricRow[]): void {
  const panel = window.createWebviewPanel(
    "csdBgDataExplorer",
    "CSD-BG Data Explorer",
    ViewColumn.One,
    { enableScripts: true, retainContextWhenHidden: true },
  );

  const tableRows = rows
    .map(
      (row) =>
        `<tr><td>${row.date}</td><td>${row.isin}</td><td>${row.issuer_name}</td><td>${row.total_shares.toLocaleString()}</td><td>${row.free_float.toLocaleString()}</td><td>${row.shareholders.toLocaleString()}</td></tr>`,
    )
    .join("");

  panel.webview.html = webviewHtml(
    "Data Explorer",
    `
    <h2>Free Float Data</h2>
    <p class="muted">${rows.length} rows (latest dates first)</p>
    <div style="overflow:auto; max-height: 80vh;">
      <table>
        <thead><tr><th>Date</th><th>ISIN</th><th>Issuer</th><th>Total Shares</th><th>Free Float</th><th>Shareholders</th></tr></thead>
        <tbody>${tableRows || "<tr><td colspan='6'>No extracted rows yet. Run download + extract first.</td></tr>"}</tbody>
      </table>
    </div>
    `,
  );

  context.subscriptions.push(panel);
}

export function showCharts(context: ExtensionContext, isin: string, points: IssuerTrendPoint[]): void {
  const panel = window.createWebviewPanel(
    "csdBgCharts",
    `CSD-BG Charts — ${isin}`,
    ViewColumn.One,
    { enableScripts: true, retainContextWhenHidden: true },
  );

  panel.webview.html = webviewHtml(
    "Charts",
    `
    <h2>Free Float Trend</h2>
    <p class="muted">${isin}${points.length ? "" : " — no trend data"}</p>
    <div class="chart-wrap"><canvas id="chart"></canvas></div>
    `,
    `
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js"></script>
    <script>
      const points = ${JSON.stringify(points)};
      const ctx = document.getElementById('chart');
      if (points.length) {
        new Chart(ctx, {
          type: 'line',
          data: {
            labels: points.map(p => p.date),
            datasets: [
              { label: 'Free Float', data: points.map(p => p.free_float), borderColor: '#4e9cff', tension: 0.2 },
              { label: 'Total Shares', data: points.map(p => p.total_shares), borderColor: '#7bd88f', tension: 0.2 }
            ]
          },
          options: { responsive: true, maintainAspectRatio: false }
        });
      } else {
        ctx.parentElement.innerHTML = '<p>No chart data for this ISIN yet.</p>';
      }
    </script>
    `,
  );

  context.subscriptions.push(panel);
}

export function showConfigEditor(
  context: ExtensionContext,
  settings: Record<string, string | number | boolean>,
  onSave: (updated: Record<string, string | number | boolean>) => void,
): void {
  const panel = window.createWebviewPanel(
    "csdBgConfig",
    "CSD-BG Config Editor",
    ViewColumn.One,
    { enableScripts: true },
  );

  panel.webview.html = webviewHtml(
    "Config Editor",
    `
    <h2>Configuration</h2>
    <p class="muted">Updates VS Code settings for this workspace.</p>
    <div class="toolbar"><label>Statistics URL<br/><input id="statisticsUrl" style="width:100%" value="${String(settings.statisticsUrl ?? "")}" /></label></div>
    <div class="toolbar"><label>Data directory<br/><input id="dataDirectory" style="width:100%" value="${String(settings.dataDirectory ?? "./data")}" /></label></div>
    <div class="toolbar"><label>Timeout<br/><input id="timeout" type="number" value="${Number(settings.timeout ?? 30)}" /></label></div>
    <div class="toolbar"><label>Early stopping threshold<br/><input id="earlyStoppingThreshold" type="number" value="${Number(settings.earlyStoppingThreshold ?? 10)}" /></label></div>
    <div class="toolbar"><label>Max pages (0 = all)<br/><input id="maxPages" type="number" value="${Number(settings.maxPages ?? 0)}" /></label></div>
    <div class="toolbar"><label><input id="usePostPagination" type="checkbox" ${settings.usePostPagination ? "checked" : ""}/> Use POST pagination</label></div>
    <div class="toolbar"><label><input id="enableEarlyStopping" type="checkbox" ${settings.enableEarlyStopping ? "checked" : ""}/> Enable early stopping</label></div>
    <button id="save">Save Settings</button>
    `,
    `
    <script>
      const vscode = acquireVsCodeApi();
      document.getElementById('save').addEventListener('click', () => {
        vscode.postMessage({
          type: 'save',
          settings: {
            statisticsUrl: document.getElementById('statisticsUrl').value,
            dataDirectory: document.getElementById('dataDirectory').value,
            timeout: Number(document.getElementById('timeout').value),
            earlyStoppingThreshold: Number(document.getElementById('earlyStoppingThreshold').value),
            maxPages: Number(document.getElementById('maxPages').value),
            usePostPagination: document.getElementById('usePostPagination').checked,
            enableEarlyStopping: document.getElementById('enableEarlyStopping').checked
          }
        });
      });
    </script>
    `,
  );

  panel.webview.onDidReceiveMessage((message) => {
    if (message.type === "save") {
      onSave(message.settings);
      void window.showInformationMessage("CSD-BG settings updated.");
    }
  });

  context.subscriptions.push(panel);
}

export function showCronSnippet(context: ExtensionContext, snippet: string): void {
  const panel = window.createWebviewPanel(
    "csdBgCron",
    "CSD-BG Cron Snippet",
    ViewColumn.One,
    { enableScripts: false },
  );

  panel.webview.html = webviewHtml(
    "Cron Snippet",
    `
    <h2>Scheduled Docker Run</h2>
    <p class="muted">Use this on Synology/cron when VS Code is closed.</p>
    <pre>${snippet.replace(/</g, "&lt;")}</pre>
    `,
  );

  context.subscriptions.push(panel);
}
