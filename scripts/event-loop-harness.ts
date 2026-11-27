/**
 * Event-loop blocking harness for the heavy import / backup / batch-PDF paths.
 *
 *   node --import tsx --import ./scripts/test-isolation.mjs scripts/event-loop-harness.ts [--mode=inline|worker] [--invoices=3000] [--pdfs=100]
 *
 * Each operation runs on synthetic data while a 1 ms ticker and
 * perf_hooks.monitorEventLoopDelay record how long the main thread was
 * unavailable. "inline" calls the original synchronous services on the main
 * thread; "worker" calls the worker-thread entry points the HTTP routes use.
 */
import { monitorEventLoopDelay, performance } from "node:perf_hooks";
import { randomUUID } from "node:crypto";
import { getSystemDb } from "../src/core/db/system";
import { users } from "../src/core/db/system-schema";
import { getBusinessDb } from "../src/core/db/business";
import { buildSyntheticManagerBackup } from "../tests/support/synthetic-manager-backup";

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value = "true"] = arg.replace(/^--/, "").split("=");
    return [key, value];
  }),
);
const mode = (args.mode ?? "inline") as "inline" | "worker";
const invoiceCount = Number(args.invoices ?? 3000);
const pdfCount = Number(args.pdfs ?? 100);
const only = args.only ? new Set(String(args.only).split(",")) : null;

type Result = { name: string; wallMs: number; maxDelayMs: number; p99Ms: number; maxTickGapMs: number };
const results: Result[] = [];

async function measure<T>(name: string, operation: () => Promise<T> | T): Promise<T> {
  const histogram = monitorEventLoopDelay({ resolution: 5 });
  let last = performance.now();
  let maxGap = 0;
  const ticker = setInterval(() => {
    const now = performance.now();
    maxGap = Math.max(maxGap, now - last);
    last = now;
  }, 1);
  histogram.enable();
  await new Promise((resolve) => setTimeout(resolve, 20));
  last = performance.now();
  const started = performance.now();
  try {
    return await operation();
  } finally {
    const wallMs = performance.now() - started;
    await new Promise((resolve) => setTimeout(resolve, 20));
    clearInterval(ticker);
    histogram.disable();
    const result = {
      name,
      wallMs: Math.round(wallMs),
      maxDelayMs: Math.round(histogram.max / 1e6),
      p99Ms: Math.round(histogram.percentile(99) / 1e6),
      maxTickGapMs: Math.round(maxGap),
    };
    results.push(result);
    console.log(JSON.stringify(result));
  }
}

const userId = `harness-${randomUUID().slice(0, 8)}`;
getSystemDb().insert(users).values({
  id: userId, name: "Harness Admin", email: `${userId}@example.test`, emailVerified: true,
  createdAt: new Date(), updatedAt: new Date(), isSuperAdmin: false, status: "active", maxBusinesses: 50, maxUsers: 5,
  isTenantAdmin: true,
}).run();

const managerBytes = buildSyntheticManagerBackup({ invoices: invoiceCount });
console.log(`mode=${mode} synthetic .manager ${(managerBytes.length / 1024 / 1024).toFixed(1)} MB, ${invoiceCount} invoices`);

const managerImporter = await import("../src/modules/migration/manager-importer");
const backupService = await import("../src/core/businesses/backup-service");
const pdfService = await import("../src/modules/document-templates/pdf-service");
const workerJobs = mode === "worker" ? await import("../src/core/workers/jobs") : null;

const run = (name: string) => !only || only.has(name);

if (run("manager-inspect")) {
  await measure("manager-inspect", () =>
    workerJobs ? workerJobs.inspectManagerBackupInWorker(managerBytes) : managerImporter.inspectManagerBackup(managerBytes));
}

const imported = await measure("manager-import", () =>
  workerJobs
    ? workerJobs.importManagerBackupInWorker(managerBytes, userId, { documentStatus: "posted" })
    : managerImporter.importManagerBackupToNewBusiness(managerBytes, userId, { documentStatus: "posted" }));
const businessId = imported.businessId;

let backup: Buffer | null = null;
if (run("backup-export") || run("backup-inspect") || run("backup-import")) {
  backup = await measure("backup-export", () => backupService.exportBusinessBackup(businessId, userId));
  console.log(`backup archive ${(backup.length / 1024 / 1024).toFixed(1)} MB`);
}
if (backup && run("backup-inspect")) {
  await measure("backup-inspect", () =>
    workerJobs ? workerJobs.inspectBackupArchiveInWorker(backup) : backupService.inspectBusinessBackupArchive(backup));
}
if (backup && run("backup-import")) {
  await measure("backup-import", () =>
    workerJobs ? workerJobs.importBusinessBackupInWorker(backup, userId) : backupService.importBusinessBackup(backup, userId));
}

async function batchPdf(label: string, count = pdfCount) {
  const { sqlite } = getBusinessDb(businessId, userId);
  const ids = (sqlite.prepare("SELECT id FROM sales_invoices ORDER BY rowid LIMIT ?").all(count) as Array<{ id: string }>).map((r) => r.id);
  const { business } = (await import("../src/core/businesses/business-service")).getBusinessForUser(businessId, userId)!;
  await measure(label, async () => {
    if (workerJobs) {
      let bytes = 0;
      for await (const item of workerJobs.generateDocumentPdfsInWorker({
        businessId, userId, businessName: business.name, baseCurrency: business.currency, documentType: "sales-invoice", documentIds: ids,
      })) {
        if (item.ok) bytes += item.pdf.length;
      }
      return bytes;
    }
    let bytes = 0;
    for (const id of ids) {
      const { pdf } = await pdfService.generateDocumentPdf(businessId, userId, business.name, business.currency, "sales-invoice", id);
      bytes += pdf.length;
    }
    return bytes;
  });
}

if (run("batch-pdf")) await batchPdf(`batch-pdf-react-${pdfCount}`);
if (run("batch-pdf-html")) {
  const { saveTemplateSettings } = await import("../src/modules/document-templates/template-service");
  const { defaultSettings } = await import("../src/modules/document-templates/template-settings");
  saveTemplateSettings(businessId, userId, "sales-invoice", {
    ...defaultSettings,
    templateType: "custom-html",
    customHtml: "<html><body><h1>{{documentNumber}}</h1>{{#each lines}}<p>{{description}} {{total}}</p>{{/each}}</body></html>",
  });
  // First run includes the one-time puppeteer-core module load + Chromium launch.
  await batchPdf(`batch-pdf-html-${pdfCount}`);
  await batchPdf("batch-pdf-html-warm-30", 30);
  const { closeHtmlPdfBrowser } = await import("../src/modules/document-templates/html-templates/browser-pool");
  await closeHtmlPdfBrowser();
}

console.log("\nmode", mode);
console.table(results);
process.exit(0);
