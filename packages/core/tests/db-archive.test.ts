import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  compressDatabase,
  compressedDbPath,
  decompressDatabase,
  DbArchiveError,
} from "@csd-bg/core";

describe("db-archive", () => {
  let tempDir: string;
  let dbPath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "csd-bg-archive-"));
    dbPath = join(tempDir, "free_float.db");
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("derives compressed path as {dbPath}.gz", () => {
    expect(compressedDbPath("/data/free_float.db")).toBe("/data/free_float.db.gz");
  });

  it("round-trips gzip compress and decompress", async () => {
    const payload = Buffer.from("sqlite-bytes-for-roundtrip");
    writeFileSync(dbPath, payload);

    const archivePath = await compressDatabase(dbPath);
    expect(archivePath).toBe(`${dbPath}.gz`);
    expect(existsSync(archivePath)).toBe(true);
    expect(gunzipSync(readFileSync(archivePath)).equals(payload)).toBe(true);

    rmSync(dbPath);
    const restoredPath = await decompressDatabase(dbPath, archivePath);
    expect(restoredPath).toBe(dbPath);
    expect(readFileSync(dbPath).equals(payload)).toBe(true);
  });

  it("produces identical gzip output for the same input", async () => {
    writeFileSync(dbPath, "same-bytes");
    const first = join(tempDir, "first.gz");
    const second = join(tempDir, "second.gz");
    await compressDatabase(dbPath, first);
    await compressDatabase(dbPath, second);
    expect(readFileSync(first).equals(readFileSync(second))).toBe(true);
  });

  it("throws when the database file is missing", async () => {
    await expect(compressDatabase(dbPath)).rejects.toThrow(DbArchiveError);
    await expect(compressDatabase(dbPath)).rejects.toThrow(/Database file not found/);
  });

  it("throws when the compressed file is missing", async () => {
    await expect(decompressDatabase(dbPath)).rejects.toThrow(DbArchiveError);
    await expect(decompressDatabase(dbPath)).rejects.toThrow(/Compressed database file not found/);
  });
});
