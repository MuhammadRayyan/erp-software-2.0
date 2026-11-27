/**
 * Worker entry for backup / migration jobs (see run-in-worker.ts). Every
 * handler runs the existing synchronous service unchanged; this thread opens
 * its own better-sqlite3 connections to the system and business databases
 * (WAL keeps the main thread's readers unblocked).
 */
import { importBusinessBackup, inspectBusinessBackupArchive, snapshotBusinessDatabase } from "@/core/businesses/backup-service";
import { importManagerBackupToNewBusiness, inspectManagerBackup, type ManagerImportOptions } from "@/modules/migration/manager-importer";
import { serveWorkerTask } from "./worker-protocol";

type Bytes = { buffer: ArrayBuffer; byteLength: number };
const toBuffer = (bytes: Bytes) => Buffer.from(bytes.buffer, 0, bytes.byteLength);

serveWorkerTask({
  "manager.inspect": (payload: { bytes: Bytes }) => inspectManagerBackup(toBuffer(payload.bytes)),
  "manager.import": (payload: { bytes: Bytes; userId: string; options: ManagerImportOptions }) =>
    importManagerBackupToNewBusiness(toBuffer(payload.bytes), payload.userId, payload.options),
  "backup.inspect": (payload: { bytes: Bytes }) => inspectBusinessBackupArchive(toBuffer(payload.bytes)),
  "backup.import": (payload: { bytes: Bytes; userId: string }) => importBusinessBackup(toBuffer(payload.bytes), payload.userId),
  "backup.snapshot": (payload: { databasePath: string; targetPath: string }) =>
    snapshotBusinessDatabase(payload.databasePath, payload.targetPath),
});
