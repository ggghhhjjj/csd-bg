export type AppConfig = {
  version: number;
};

export function isAppConfig(value: unknown): value is AppConfig {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  return typeof record['version'] === 'number' && Number.isInteger(record['version']) && record['version'] > 0;
}
