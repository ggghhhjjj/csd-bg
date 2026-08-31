#!/usr/bin/env node
/**
 * Increments the integer build number in public/assets/app.config.json.
 * Runs only in CI (or when BUMP_APP_VERSION=1) so local builds stay unchanged.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const defaultConfigPath = join(scriptDir, '..', 'public', 'assets', 'app.config.json');
const configPathFromEnv = process.env.APP_CONFIG_PATH;

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const ifCi = args.has('--if-ci');

export function shouldBump(options = {}) {
  const requireCi = options.ifCi ?? ifCi;
  if (requireCi) {
    return process.env.CI === 'true' || process.env.BUMP_APP_VERSION === '1';
  }
  return true;
}

function readVersion(configPath) {
  const raw = readFileSync(configPath, 'utf8');
  const payload = JSON.parse(raw);
  if (
    !payload ||
    typeof payload !== 'object' ||
    typeof payload.version !== 'number' ||
    !Number.isInteger(payload.version) ||
    payload.version <= 0
  ) {
    throw new Error(`Invalid app.config.json at ${configPath}`);
  }
  return payload.version;
}

function writeVersion(configPath, version) {
  const content = `${JSON.stringify({ version }, null, 2)}\n`;
  writeFileSync(configPath, content, 'utf8');
}

export function bumpAppVersion(options = {}) {
  const configPath = options.configPath ?? configPathFromEnv ?? defaultConfigPath;
  const isDryRun = options.dryRun ?? dryRun;
  const force = options.force ?? (!ifCi || shouldBump({ ifCi: true }));

  if (!force) {
    return { bumped: false, version: readVersion(configPath) };
  }

  const current = readVersion(configPath);
  const next = current + 1;
  if (!isDryRun) {
    writeVersion(configPath, next);
  }
  return { bumped: true, version: next, previous: current };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!shouldBump()) {
    console.log('[bump-app-version] skipped (not CI)');
    process.exit(0);
  }
  const result = bumpAppVersion();
  const prefix = dryRun ? '[bump-app-version] dry-run' : '[bump-app-version]';
  console.log(`${prefix} ${result.previous} → ${result.version}`);
}
