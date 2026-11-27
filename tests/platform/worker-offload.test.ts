import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { monitorEventLoopDelay, performance } from "node:perf_hooks";
import path from "node:path";
import { Worker } from "node:worker_threads";
import JSZip from "jszip";
import { getSystemDb, getSystemSqlite } from "../../src/core/db/system";
import { users } from "../../src/core/db/system-schema";
import { getBusinessDb } from "../../src/core/db/business";
import { getBusinessForUser } from "../../src/core/businesses/business-service";
import { exportBusinessBackup } from "../../src/core/businesses/backup-service";
import { importManagerBackupToNewBusiness } from "../../src/modules/migration/manager-importer";
import {
  generateDocumentPdfsInWorker,
  importBusinessBackupInWorker,
  importManagerBackupInWorker,
  inspectBackupArchiveInWorker,
  inspectManagerBackupInWorker,
} from "../../src/core/workers/jobs";
import { resolveWorkerEntry, runInWorker, WorkerTimeoutError } from "../../src/core/workers/run-in-worker";
import { buildSyntheticManagerBackup } from "../support/synthetic-manager-backup";

/**
 * Heavy import / backup / PDF jobs run on worker threads. These tests assert
 * that the main event loop stays responsive while they run, and that results,
 * errors, timeouts and cancellation cross the thread boundary intact.
 */

// Generous for loaded CI hosts; the same import inline blocks for >1 s.
const MAX_MAIN_THREAD_DELAY_MS = 250;

const userId = `worker-offload-${randomUUID().slice(0, 8)}`;
getSystemDb().insert(users).values({
  id: userId, name: "Worker Offload Admin", email: `${userId}@example.test`, emailVerified: true,
  createdAt: new Date(), updatedAt: new Date(), isSuperAdmin: false, status: "active", maxBusinesses: 50, maxUsers: 5,
  isTenantAdmin: true,
}).run();

const managerBytes = buildSyntheticManagerBackup({ invoices: 1000 });

async function measureMainThread<T>(operation: () => Promise<T>) {
  const histogram = monitorEventLoopDelay({ resolution: 5 });
  let last = performance.now();
  let maxGap = 0;
  const ticker = setInterval(() => {
    const now = performance.now();
    maxGap = Math.max(maxGap, now - last);
    last = now;
  }, 2);
  histogram.enable();
  try {
    const value = await operation();
    // Let one more timer fire so a fully synchronous operation is measured too.
    await new Promise((resolve) => setTimeout(resolve, 10));
    return { value, maxGapMs: maxGap, maxDelayMs: histogram.max / 1e6 };
  } finally {
    clearInterval(ticker);
    histogram.disable();
  }
}

const businessCount = () => (getSystemSqlite().prepare("SELECT COUNT(*) AS c FROM businesses").get() as { c: number }).c;

let importedBusinessId = "";

test("the same Manager.io import blocks the event loop when run inline (harness sanity check)", async () => {
  const { value, maxGapMs } = await measureMainThread(async () => importManagerBackupToNewBusiness(managerBytes, userId));
  assert.ok(value.businessId);
  assert.ok(maxGapMs > MAX_MAIN_THREAD_DELAY_MS, `inline import only blocked ${Math.round(maxGapMs)} ms`);
});

test("Manager.io import in a worker keeps the main event loop responsive", async () => {
  const { value, maxGapMs, maxDelayMs } = await measureMainThread(() =>
    importManagerBackupInWorker(managerBytes, userId, { documentStatus: "posted" }));
  assert.ok(maxGapMs < MAX_MAIN_THREAD_DELAY_MS, `main thread blocked ${Math.round(maxGapMs)} ms (histogram max ${Math.round(maxDelayMs)} ms)`);
  assert.equal(value.summary.salesInvoicesCount, 1000);
  assert.equal(value.ledger.invoicesPosted, 1000);
  importedBusinessId = value.businessId;

  // The worker's writes are visible to the main thread's own connections.
  const { sqlite } = getBusinessDb(importedBusinessId, userId);
  assert.equal((sqlite.prepare("SELECT COUNT(*) AS c FROM sales_invoices").get() as { c: number }).c, 1000);
  assert.equal(getBusinessForUser(importedBusinessId, userId)?.membership.role, "administrator");
});

test("Manager.io inspection runs in a worker and leaves the caller's buffer intact", async () => {
  const summary = await inspectManagerBackupInWorker(managerBytes);
  assert.equal(summary.salesInvoicesCount, 1000);
  assert.equal(managerBytes.byteLength > 0 && managerBytes[0], "S".charCodeAt(0));
});

test("worker errors propagate with their message and leave no business behind", async () => {
  const before = businessCount();
  await assert.rejects(
    importManagerBackupInWorker(Buffer.from("SQLite format 3\0 but not really a database"), userId, {}),
    (error: Error) => error instanceof Error && error.message.length > 0 && !/exit code/.test(error.message),
  );
  assert.equal(businessCount(), before);
});

test("backup export, inspection and verified restore keep the main event loop responsive", async () => {
  assert.ok(importedBusinessId, "depends on the worker import test");
  const exported = await measureMainThread(() => exportBusinessBackup(importedBusinessId, userId));
  assert.ok(exported.maxGapMs < MAX_MAIN_THREAD_DELAY_MS, `export blocked ${Math.round(exported.maxGapMs)} ms`);
  const backup = exported.value;

  const manifest = await inspectBackupArchiveInWorker(backup) as { formatVersion: number; databaseSha256: string };
  assert.equal(manifest.formatVersion, 2);

  const restored = await measureMainThread(() => importBusinessBackupInWorker(backup, userId));
  assert.ok(restored.maxGapMs < MAX_MAIN_THREAD_DELAY_MS, `restore (integrity check) blocked ${Math.round(restored.maxGapMs)} ms`);
  const { sqlite } = getBusinessDb(restored.value, userId);
  assert.equal((sqlite.prepare("SELECT COUNT(*) AS c FROM sales_invoices").get() as { c: number }).c, 1000);

  // A tampered archive is rejected inside the worker; the reason reaches the caller.
  const zip = await JSZip.loadAsync(backup);
  const tamperedManifest = { ...manifest, databaseSha256: "0".repeat(64) };
  zip.file("manifest.json", JSON.stringify(tamperedManifest));
  const tampered = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  await assert.rejects(importBusinessBackupInWorker(tampered, userId), /checksum does not match/);
});

test("batch PDFs are rendered in a worker, in order, with per-document failures reported", async () => {
  assert.ok(importedBusinessId, "depends on the worker import test");
  const { sqlite } = getBusinessDb(importedBusinessId, userId);
  const ids = (sqlite.prepare("SELECT id FROM sales_invoices ORDER BY rowid LIMIT 3").all() as Array<{ id: string }>).map((r) => r.id);
  const access = getBusinessForUser(importedBusinessId, userId)!;
  const payload = {
    businessId: importedBusinessId, userId, businessName: access.business.name, baseCurrency: access.business.currency,
    documentType: "sales-invoice", documentIds: [ids[0], "missing-invoice", ids[1], ids[2]],
  };
  const { value: items, maxGapMs } = await measureMainThread(async () => {
    const collected = [];
    for await (const item of generateDocumentPdfsInWorker(payload)) collected.push(item);
    return collected;
  });
  assert.ok(maxGapMs < MAX_MAIN_THREAD_DELAY_MS, `batch PDF blocked ${Math.round(maxGapMs)} ms`);
  assert.deepEqual(items.map((item) => [item.documentId, item.ok]), [[ids[0], true], ["missing-invoice", false], [ids[1], true], [ids[2], true]]);
  for (const item of items) if (item.ok) assert.equal(item.pdf.subarray(0, 5).toString("latin1"), "%PDF-");

  // Stopping early (client disconnect) terminates the worker instead of rendering the rest.
  const controller = new AbortController();
  let received = 0;
  const started = performance.now();
  for await (const item of generateDocumentPdfsInWorker({ ...payload, documentIds: Array(100).fill(ids[0]) }, { signal: controller.signal })) {
    assert.ok(item.ok);
    received += 1;
    if (received === 1) controller.abort();
  }
  assert.ok(received < 100, `received ${received} documents after abort`);
  assert.ok(performance.now() - started < 20_000);
});

test("timeouts and aborts terminate the worker", async () => {
  await assert.rejects(
    runInWorker("migration.worker", "manager.import", { bytes: { buffer: new ArrayBuffer(0), byteLength: 0 }, userId, options: {} }, { timeoutMs: 1 }),
    (error: unknown) => error instanceof WorkerTimeoutError,
  );
  const controller = new AbortController();
  const pending = inspectManagerBackupInWorker(managerBytes, { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, /abort/i);
});

test("workers stub the server-only marker package (with and without the react-server condition)", async () => {
  const probe = path.resolve("tests/support/server-only-probe.worker.ts");
  for (const entry of ["migration.worker", "document-pdf.worker"] as const) {
    const { execArgv } = resolveWorkerEntry(entry);
    const worker = new Worker(probe, { execArgv });
    const message = await new Promise((resolve, reject) => {
      worker.once("message", resolve);
      worker.once("error", reject);
    });
    await worker.terminate();
    assert.equal(message, "ok", entry);
  }
});
