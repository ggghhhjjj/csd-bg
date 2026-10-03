import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { HELP_TOPIC_IDS } from './help-topic-id';
import { isHelpTopicsConfig } from './help.types';

const specDir = dirname(fileURLToPath(import.meta.url));
const webRoot = join(specDir, '..', '..', '..', '..');
const repoRoot = join(webRoot, '..');
const manifestPath = join(webRoot, 'public', 'assets', 'help-topics.json');
const helpWebRoot = join(repoRoot, 'help-web');

describe('help-topics.json manifest', () => {
  it('matches HELP_TOPIC_IDS and help-web sources', () => {
    const raw = readFileSync(manifestPath, 'utf8');
    const payload: unknown = JSON.parse(raw);
    expect(isHelpTopicsConfig(payload)).toBe(true);
    if (!isHelpTopicsConfig(payload)) {
      return;
    }

    const manifestIds = Object.keys(payload.topics).sort();
    const expectedIds = [...HELP_TOPIC_IDS].sort();
    expect(manifestIds).toEqual(expectedIds);

    for (const id of HELP_TOPIC_IDS) {
      const entry = payload.topics[id];
      const relative = entry.entryPath.replace(/^help\//, '');
      const sourcePath = join(helpWebRoot, relative);
      expect(existsSync(sourcePath), `missing help-web file for ${id}: ${sourcePath}`).toBe(true);
    }
  });
});
