export type IntroConfig = {
  contentVersion: string;
  entryPath: string;
};

export function isIntroConfig(value: unknown): value is IntroConfig {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  return typeof record['contentVersion'] === 'string' && typeof record['entryPath'] === 'string';
}

export function buildIntroEntryUrl(config: IntroConfig, locale: string): string {
  const base = config.entryPath.replace(/^\//, '');
  const params = new URLSearchParams({
    v: config.contentVersion,
    lang: locale,
  });
  return `${base}?${params.toString()}`;
}
