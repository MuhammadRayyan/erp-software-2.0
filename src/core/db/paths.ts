import "server-only";

import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";

const configuredRoot = process.env.ERP_DATA_DIR ?? path.join(process.cwd(), "data");

export const DATA_ROOT = path.resolve(/*turbopackIgnore: true*/ configuredRoot);
export const SYSTEM_DIRECTORY = path.join(DATA_ROOT, "system");
export const SYSTEM_DB_PATH = path.join(SYSTEM_DIRECTORY, "system.sqlite");
export const BUSINESSES_DIRECTORY = path.join(DATA_ROOT, "businesses");
/**
 * Disk-backed scratch space for large temporary files (uploaded backups,
 * Manager.io imports). The container's /tmp is RAM-backed tmpfs that counts
 * against its memory limit, so files of up to hundreds of MB go here instead.
 * Excluded from deploy snapshots.
 */
export const SCRATCH_DIRECTORY_NAME = ".scratch";
export const SCRATCH_DIRECTORY = path.join(DATA_ROOT, SCRATCH_DIRECTORY_NAME);

/** Creates a private, uniquely named directory under the scratch space. The caller removes it. */
export function makeScratchDirectory(prefix: string) {
  mkdirSync(SCRATCH_DIRECTORY, { recursive: true, mode: 0o700 });
  return mkdtempSync(path.join(SCRATCH_DIRECTORY, prefix));
}

/** Removes scratch entries left behind by a crash; anything younger than maxAgeMs may still be in use. */
export function cleanStaleScratch(maxAgeMs = 60 * 60 * 1000) {
  let entries: string[];
  try {
    entries = readdirSync(SCRATCH_DIRECTORY);
  } catch {
    return;
  }
  const cutoff = Date.now() - maxAgeMs;
  for (const name of entries) {
    const entry = path.join(SCRATCH_DIRECTORY, name);
    try {
      if (statSync(entry).mtimeMs < cutoff) rmSync(entry, { recursive: true, force: true });
    } catch {
      // Best effort.
    }
  }
}

export function ensureDataDirectories() {
  mkdirSync(SYSTEM_DIRECTORY, { recursive: true });
  mkdirSync(BUSINESSES_DIRECTORY, { recursive: true });
}

export function getBusinessPaths(directoryKey: string) {
  if (!/^[a-f0-9-]{36}$/i.test(directoryKey)) {
    throw new Error("Invalid trusted business directory key");
  }

  const directory = path.join(BUSINESSES_DIRECTORY, directoryKey);
  return {
    directory,
    database: path.join(directory, "business.sqlite"),
    attachments: path.join(directory, "attachments"),
  };
}
