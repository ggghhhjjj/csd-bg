import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

import initSqlJs from "sql.js";

let sqlJsPromise: ReturnType<typeof initSqlJs> | null = null;

export async function initSqlJsRuntime(): Promise<Awaited<ReturnType<typeof initSqlJs>>> {
  if (!sqlJsPromise) {
    const require = createRequire(import.meta.url);
    const wasmPath = require.resolve("sql.js/dist/sql-wasm.wasm");
    sqlJsPromise = initSqlJs({
      locateFile: () => wasmPath,
    });
  }
  return sqlJsPromise;
}

export function resolveSqlWasmPath(): string {
  const require = createRequire(import.meta.url);
  return require.resolve("sql.js/dist/sql-wasm.wasm");
}

export function extensionRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..");
}

export function databaseExists(dbPath: string): boolean {
  return existsSync(dbPath);
}
