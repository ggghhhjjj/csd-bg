#!/usr/bin/env node
/**
 * Copies help-web/ into web/public/help/ before serve/build.
 * Keeps contextual help content as a separate static project at repo root.
 */

import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const webRoot = join(scriptDir, '..');
const helpSource = join(webRoot, '..', 'help-web');
const helpTarget = join(webRoot, 'public', 'help');

rmSync(helpTarget, { recursive: true, force: true });
mkdirSync(helpTarget, { recursive: true });
cpSync(helpSource, helpTarget, { recursive: true });

console.log(`[copy-help] ${helpSource} → ${helpTarget}`);
