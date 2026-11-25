import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import JSZip from "jszip";
import { getSystemDb } from "../../src/core/db/system";
import { users } from "../../src/core/db/system-schema";
import { getBusinessDb } from "../../src/core/db/business";
import { assertBusinessQuota, createBusiness } from "../../src/core/businesses/business-service";
import { exportBusinessBackup, importBusinessBackup } from "../../src/core/businesses/backup-service";

const ownerId = `backup-owner-${randomUUID().slice(0, 8)}`;
getSystemDb()
  .insert(users)
  .values({
    id: ownerId,
    name: "Backup Owner",
    email: `${ownerId}@example.test`,
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    isSuperAdmin: false,
    status: "active",
    maxBusinesses: 20,
    maxUsers: 5,
    isTenantAdmin: true,
  })
  .run();

const source = createBusiness({ name: "Backup Source LLC", country: "AE", currency: "AED", financialYearStartMonth: 1 }, ownerId);
const cleanBackup = Buffer.from(await exportBusinessBackup(source.id, ownerId));

/** Rewrites business.sqlite inside a backup and fixes the manifest checksum. */
async function withModifiedDatabase(mutate: (sqlite: Database.Database) => void) {
  const zip = await JSZip.loadAsync(cleanBackup);
  const dir = mkdtempSync(path.join(tmpdir(), "backup-hardening-"));
  try {
    const dbPath = path.join(dir, "business.sqlite");
    writeFileSync(dbPath, await zip.file("business.sqlite")!.async("nodebuffer"));
    const sqlite = new Database(dbPath);
    mutate(sqlite);
    sqlite.pragma("journal_mode = DELETE");
    sqlite.close();
    const database = readFileSync(dbPath);
    const manifest = JSON.parse(await zip.file("manifest.json")!.async("string"));
    manifest.databaseSha256 = createHash("sha256").update(database).digest("hex");
    zip.file("business.sqlite", database);
    zip.file("manifest.json", JSON.stringify(manifest));
    return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("a clean backup round-trips", async () => {
  const importedId = await importBusinessBackup(cleanBackup, ownerId);
  assert.ok(importedId);
});

test("a backup carrying its own trigger is rejected", async () => {
  const backup = await withModifiedDatabase((sqlite) => {
    sqlite.exec(`CREATE TRIGGER rewrite_customers AFTER INSERT ON customers BEGIN UPDATE customers SET name = 'x'; END;`);
  });
  await assert.rejects(importBusinessBackup(backup, ownerId), /not part of the application schema/);
});

test("a tampered application trigger is restored to its reference definition", async () => {
  let triggerName = "";
  const backup = await withModifiedDatabase((sqlite) => {
    const trigger = sqlite.prepare("SELECT name, tbl_name FROM sqlite_master WHERE type = 'trigger' ORDER BY name LIMIT 1").get() as {
      name: string;
      tbl_name: string;
    };
    triggerName = trigger.name;
    sqlite.exec(`DROP TRIGGER "${trigger.name}"`);
    sqlite.exec(`CREATE TRIGGER "${trigger.name}" BEFORE DELETE ON "${trigger.tbl_name}" BEGIN SELECT 1; END;`);
  });
  const importedId = await importBusinessBackup(backup, ownerId);
  const restored = getBusinessDb(importedId, ownerId)
    .sqlite.prepare("SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = ?")
    .get(triggerName) as { sql: string };
  assert.ok(!/SELECT 1; END/.test(restored.sql), "tampered body was replaced");
});

test("a decompression bomb is stopped before it is inflated", async () => {
  const zip = await JSZip.loadAsync(cleanBackup);
  zip.file("attachments/bomb.bin", Buffer.alloc(60 * 1024 * 1024));
  const bomb = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  assert.ok(bomb.length < 5 * 1024 * 1024, "fixture compresses to a small upload");
  await assert.rejects(importBusinessBackup(bomb, ownerId), /maximum allowed size/);
});

test("business imports respect the owner's business quota", () => {
  const limitedId = `limited-${randomUUID().slice(0, 8)}`;
  getSystemDb()
    .insert(users)
    .values({
      id: limitedId,
      name: "Limited",
      email: `${limitedId}@example.test`,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      isSuperAdmin: false,
      status: "active",
      maxBusinesses: 1,
      maxUsers: 1,
      isTenantAdmin: true,
    })
    .run();
  assert.doesNotThrow(() => assertBusinessQuota(limitedId));
  createBusiness({ name: "Only Business", country: "AE", currency: "AED", financialYearStartMonth: 1 }, limitedId);
  assert.throws(() => assertBusinessQuota(limitedId), /QUOTA_EXCEEDED/);
});

test("an entry that lies about its size is cut off while inflating", async () => {
  const { readZipEntryLimited } = await import("../../src/core/businesses/zip-limits");
  const zip = new JSZip();
  zip.file("big.bin", Buffer.alloc(8 * 1024 * 1024));
  const loaded = await JSZip.loadAsync(await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
  const entry = loaded.file("big.bin")!;
  (entry as unknown as { _data: { uncompressedSize: number } })._data.uncompressedSize = 10;
  await assert.rejects(readZipEntryLimited(entry, 1024 * 1024), /maximum allowed size/);
});
