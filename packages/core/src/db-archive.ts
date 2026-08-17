import { createReadStream, createWriteStream, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { pipeline } from "node:stream/promises";
import { createGunzip, createGzip } from "node:zlib";

import { DbArchiveError } from "./errors.js";

export function compressedDbPath(dbPath: string): string {
  return `${dbPath}.gz`;
}

export async function compressDatabase(
  dbPath: string,
  archivePath = compressedDbPath(dbPath),
): Promise<string> {
  if (!existsSync(dbPath)) {
    throw new DbArchiveError(`Database file not found: ${dbPath}`);
  }

  mkdirSync(dirname(archivePath), { recursive: true });

  try {
    await pipeline(
      createReadStream(dbPath),
      createGzip({ mtime: 0 } as Parameters<typeof createGzip>[0]),
      createWriteStream(archivePath),
    );
  } catch (error) {
    throw new DbArchiveError(
      `Failed to compress database: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return archivePath;
}

export async function decompressDatabase(
  dbPath: string,
  archivePath = compressedDbPath(dbPath),
): Promise<string> {
  if (!existsSync(archivePath)) {
    throw new DbArchiveError(`Compressed database file not found: ${archivePath}`);
  }

  mkdirSync(dirname(dbPath), { recursive: true });

  try {
    await pipeline(
      createReadStream(archivePath),
      createGunzip(),
      createWriteStream(dbPath),
    );
  } catch (error) {
    throw new DbArchiveError(
      `Failed to decompress database: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return dbPath;
}
