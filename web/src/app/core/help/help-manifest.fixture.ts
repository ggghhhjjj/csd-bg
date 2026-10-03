/** Minimal help-topics.json shape for unit tests that mount HelpTrigger. */
export const HELP_MANIFEST_FIXTURE = {
  topics: {
    'statistics.shareholders-diff-rank': {
      entryPath: 'help/statistics/shareholders-diff-rank/index.html',
      contentVersion: '1.0.0',
    },
    'statistics.range-presets': {
      entryPath: 'help/statistics/range-presets/index.html',
      contentVersion: '1.0.0',
    },
    'statistics.shareholders-flow-daily-chart': {
      entryPath: 'help/statistics/shareholders-flow-daily-chart/index.html',
      contentVersion: '1.0.0',
    },
    'statistics.shareholders-total-daily-chart': {
      entryPath: 'help/statistics/shareholders-total-daily-chart/index.html',
      contentVersion: '1.0.0',
    },
    'statistics.shareholders-total-period-daily-chart': {
      entryPath: 'help/statistics/shareholders-total-period-daily-chart/index.html',
      contentVersion: '1.0.0',
    },
  },
} as const;
