import type { HelpTopicId } from './help-topic-id';

export type HelpTopicEntry = {
  entryPath: string;
  contentVersion: string;
};

export type HelpTopicsConfig = {
  topics: Record<HelpTopicId, HelpTopicEntry>;
};

export function isHelpTopicsConfig(value: unknown): value is HelpTopicsConfig {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  const topics = record['topics'];
  if (!topics || typeof topics !== 'object') {
    return false;
  }
  for (const entry of Object.values(topics as Record<string, unknown>)) {
    if (!isHelpTopicEntry(entry)) {
      return false;
    }
  }
  return true;
}

function isHelpTopicEntry(value: unknown): value is HelpTopicEntry {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  return typeof record['entryPath'] === 'string' && typeof record['contentVersion'] === 'string';
}

export function buildHelpEntryUrl(entry: HelpTopicEntry, locale: string): string {
  const base = entry.entryPath.replace(/^\//, '');
  const params = new URLSearchParams({
    v: entry.contentVersion,
    lang: locale,
  });
  return `${base}?${params.toString()}`;
}
