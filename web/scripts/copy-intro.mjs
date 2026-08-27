#!/usr/bin/env node
/**
 * Copies intro-web/ into web/public/intro/ before serve/build.
 * Keeps intro content as a separate static project at repo root.
 */

import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const webRoot = join(scriptDir, '..');
const introSource = join(webRoot, '..', 'intro-web');
const introTarget = join(webRoot, 'public', 'intro');

rmSync(introTarget, { recursive: true, force: true });
mkdirSync(introTarget, { recursive: true });
cpSync(introSource, introTarget, { recursive: true });

console.log(`[copy-intro] ${introSource} → ${introTarget}`);
