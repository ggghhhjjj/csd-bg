export type SharePayload = {
  title: string;
  url: string;
};

export type SharePayloadLabels = {
  title: string;
  appText: string;
  issuerText: string;
};

export type ShareIssuer = {
  name?: string;
  isin: string;
};

export function issuerIsinFromUrl(url: string): string | null {
  const match = url.match(/\/issuer\/([^/?#]+)/);
  if (!match) {
    return null;
  }
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

export function buildSharePayload(
  href: string,
  labels: SharePayloadLabels,
  issuer?: ShareIssuer | null,
): SharePayload {
  if (!issuer) {
    return { title: `${labels.title} · ${labels.appText}`, url: href };
  }
  const name = issuer.name?.trim() ? issuer.name : issuer.isin;
  const issuerLabel = interpolate(labels.issuerText, { name, isin: issuer.isin });
  return {
    title: `${issuerLabel} · ${labels.title}`,
    url: href,
  };
}

export function isShareAbortError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError';
}

function interpolate(template: string, params: Record<string, string>): string {
  let value = template;
  for (const [name, replacement] of Object.entries(params)) {
    value = value.replaceAll(`{${name}}`, replacement);
  }
  return value;
}
