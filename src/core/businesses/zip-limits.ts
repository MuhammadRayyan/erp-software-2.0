import { crc32 } from "node:zlib";
import type JSZip from "jszip";

/**
 * Decompression limits for uploaded backup archives. A 50 MB upload can
 * inflate to ~50 GB with deflate, so declared sizes are pre-checked and every
 * entry is inflated through a counting stream that stops at its limit.
 */
export const BACKUP_ZIP_LIMITS = {
  maxEntries: 20_000,
  maxDatabaseBytes: 256 * 1024 * 1024,
  maxManifestBytes: 1024 * 1024,
  maxAttachmentBytes: 50 * 1024 * 1024,
  maxTotalBytes: 1024 * 1024 * 1024,
} as const;

type ZipEntryInternals = { _data?: { uncompressedSize?: number; crc32?: number } };

function declaredSize(entry: JSZip.JSZipObject) {
  return (entry as unknown as ZipEntryInternals)._data?.uncompressedSize;
}

function declaredCrc(entry: JSZip.JSZipObject) {
  return (entry as unknown as ZipEntryInternals)._data?.crc32;
}

/** Rejects archives whose entry count or declared sizes exceed the limits. */
export function assertZipWithinDeclaredLimits(zip: JSZip) {
  const entries = Object.values(zip.files).filter((entry) => !entry.dir);
  if (entries.length > BACKUP_ZIP_LIMITS.maxEntries) {
    throw new Error(`Backup contains too many files (limit ${BACKUP_ZIP_LIMITS.maxEntries}).`);
  }
  let total = 0;
  for (const entry of entries) {
    const size = declaredSize(entry);
    if (typeof size === "number" && size >= 0) total += size;
  }
  if (total > BACKUP_ZIP_LIMITS.maxTotalBytes) {
    throw new Error("Backup expands beyond the maximum allowed size.");
  }
}

/**
 * Inflates one entry, aborting as soon as it exceeds `maxBytes`, and verifies
 * its CRC-32 against the archive directory.
 */
export function readZipEntryLimited(entry: JSZip.JSZipObject, maxBytes: number): Promise<Buffer> {
  const declared = declaredSize(entry);
  if (typeof declared === "number" && declared > maxBytes) {
    return Promise.reject(new Error(`Backup file ${entry.name} exceeds the maximum allowed size.`));
  }
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let settled = false;
    // nodeStream() applies backpressure: once we stop reading, inflation stops.
    const stream = entry.nodeStream("nodebuffer");
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      stream.removeAllListeners("data");
      stream.pause();
      reject(error);
    };
    stream.on("data", (chunk: Buffer) => {
      if (settled) return;
      total += chunk.length;
      if (total > maxBytes) {
        fail(new Error(`Backup file ${entry.name} exceeds the maximum allowed size.`));
        return;
      }
      chunks.push(chunk);
    });
    stream.on("error", (error: Error) => fail(error));
    stream.on("end", () => {
      if (settled) return;
      const buffer = Buffer.concat(chunks, total);
      const expectedCrc = declaredCrc(entry);
      if (typeof expectedCrc === "number" && (crc32(buffer) >>> 0) !== (expectedCrc >>> 0)) {
        fail(new Error(`Backup file ${entry.name} is corrupted (CRC mismatch).`));
        return;
      }
      settled = true;
      resolve(buffer);
    });
  });
}

/** Tracks inflated bytes across all entries of one archive. */
export function createZipBudget(maxTotalBytes: number = BACKUP_ZIP_LIMITS.maxTotalBytes) {
  let used = 0;
  return {
    remaining: () => maxTotalBytes - used,
    consume(bytes: number) {
      used += bytes;
      if (used > maxTotalBytes) throw new Error("Backup expands beyond the maximum allowed size.");
    },
  };
}
