export const HELP_TOPIC_IDS = [
  'statistics.shareholders-diff-rank',
  'statistics.range-presets',
  'statistics.shareholders-flow-daily-chart',
  'statistics.shareholders-total-daily-chart',
  'statistics.shareholders-total-period-daily-chart',
] as const;

export type HelpTopicId = (typeof HELP_TOPIC_IDS)[number];

export function isHelpTopicId(value: string): value is HelpTopicId {
  return (HELP_TOPIC_IDS as readonly string[]).includes(value);
}
