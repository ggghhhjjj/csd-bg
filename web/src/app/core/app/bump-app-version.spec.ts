import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const scriptPath = join(dirname(fileURLToPath(import.meta.url)), '../../../../scripts/bump-app-version.mjs');

describe('bump-app-version.mjs', () => {
  let configPath: string;

  beforeEach(() => {
    const tempDir = mkdtempSync(join(tmpdir(), 'bump-app-version-'));
    configPath = join(tempDir, 'app.config.json');
    writeFileSync(configPath, `${JSON.stringify({ version: 3 }, null, 2)}\n`, 'utf8');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('increments the integer version when forced', () => {
    runBump({ force: true });

    expect(readVersion()).toBe(4);
  });

  it('supports dry-run without writing', () => {
    runBump({ force: true, dryRun: true });

    expect(readVersion()).toBe(3);
  });

  it('skips when not CI and --if-ci is used', () => {
    runBump({ ifCi: true, ci: false });

    expect(readVersion()).toBe(3);
  });

  it('runs when BUMP_APP_VERSION=1 is set with --if-ci', () => {
    runBump({ ifCi: true, ci: false, bumpEnv: true });

    expect(readVersion()).toBe(4);
  });

  function readVersion() {
    return JSON.parse(readFileSync(configPath, 'utf8')).version;
  }

  function runBump(options: { force?: boolean; dryRun?: boolean; ifCi?: boolean; ci?: boolean; bumpEnv?: boolean }) {
    const args = [scriptPath];
    if (options.ifCi) {
      args.push('--if-ci');
    }
    if (options.dryRun) {
      args.push('--dry-run');
    }

    const env = {
      ...process.env,
      APP_CONFIG_PATH: configPath,
      CI: options.ci === false ? '' : 'true',
      BUMP_APP_VERSION: options.bumpEnv ? '1' : '',
    };

    if (options.force) {
      env.BUMP_APP_VERSION = '1';
      env.CI = 'true';
    }

    execFileSync(process.execPath, args, { env, stdio: 'pipe' });
  }
});
