/**
 * End-to-end check of the worker-thread jobs against a production standalone
 * build. Starts `<dist>/standalone/server.js` on a private data directory,
 * signs in through Better Auth, triggers each heavy route over HTTP and polls
 * /api/health meanwhile to show the event loop stays responsive.
 *
 *   NEXT_DIST_DIR=.next-validate npm run build
 *   node --import tsx scripts/verify-worker-offload-http.ts [--dist=.next-validate] [--port=3107] [--invoices=3000]
 */
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { cpSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import Database from "better-sqlite3";

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v = "true"] = a.replace(/^--/, "").split("="); return [k, v]; }));
const dist = String(args.dist ?? ".next-validate");
const port = Number(args.port ?? 3107);
const invoices = Number(args.invoices ?? 3000);
const standalone = path.resolve(dist, "standalone");
const base = `http://127.0.0.1:${port}`;

if (!existsSync(path.join(standalone, "server.js"))) throw new Error(`${standalone}/server.js missing: build first`);
for (const bundle of ["migration.worker.cjs", "document-pdf.worker.cjs"]) {
  if (!existsSync(path.join(standalone, "dist-workers", bundle))) throw new Error(`standalone output lacks dist-workers/${bundle}`);
}
// The Dockerfile copies public/ (PDF fonts) next to server.js; mirror that.
if (!existsSync(path.join(standalone, "public"))) cpSync("public", path.join(standalone, "public"), { recursive: true });

const dataDir = mkdtempSync(path.join(tmpdir(), "erp-worker-http-"));
const env: NodeJS.ProcessEnv = {
  ...process.env,
  NODE_ENV: "production" as const,
  PORT: String(port),
  HOSTNAME: "127.0.0.1",
  ERP_DATA_DIR: dataDir,
  BETTER_AUTH_SECRET: randomBytes(48).toString("hex"),
  BETTER_AUTH_URL: base,
  APP_DOMAIN: `127.0.0.1:${port}`,
  BETTER_AUTH_TRUSTED_ORIGINS: base,
};
// Seed in this process with sign-up enabled (production config disables it).
Object.assign(process.env, { ...env, NODE_ENV: "development" });

// Seed one user with a password (same Better Auth config as the server).
const email = "worker-check@example.test";
// Throwaway sign-in credential, random per run.
const signInKey = randomBytes(18).toString("base64url");
{
  const { migrateDatabases } = await import("../src/core/db/migrate");
  migrateDatabases();
  const { auth } = await import("../src/core/auth/auth");
  await auth.api.signUpEmail({ body: { name: "Worker Check", email, password: signInKey } });
  const { getSystemSqlite } = await import("../src/core/db/system");
  getSystemSqlite().prepare(`UPDATE "user" SET emailVerified = 1, max_businesses = 50, status = 'active' WHERE email = ?`).run(email);
}
const { buildSyntheticManagerBackup } = await import("../tests/support/synthetic-manager-backup");
const managerFile = buildSyntheticManagerBackup({ invoices });

const server = spawn(process.execPath, ["server.js"], { cwd: standalone, env, stdio: ["ignore", "pipe", "pipe"] });
const serverLog: string[] = [];
server.stdout.on("data", (d) => serverLog.push(String(d)));
server.stderr.on("data", (d) => serverLog.push(String(d)));
const stop = () => { server.kill("SIGTERM"); rmSync(dataDir, { recursive: true, force: true }); };

try {
  for (let i = 0; ; i += 1) {
    try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* starting */ }
    if (i > 100) throw new Error(`server did not start:\n${serverLog.join("")}`);
    await new Promise((r) => setTimeout(r, 200));
  }

  const signIn = await fetch(`${base}/api/auth/sign-in/email`, {
    method: "POST", headers: { "Content-Type": "application/json", Origin: base }, body: JSON.stringify({ email, password: signInKey }),
  });
  if (!signIn.ok) throw new Error(`sign-in failed ${signIn.status}: ${await signIn.text()}`);
  const cookie = signIn.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  const headers = { cookie, Origin: base };

  // Health poller: worst-case /api/health latency while each job runs.
  async function withHealthProbe<T>(label: string, job: () => Promise<T>) {
    let running = true;
    let maxMs = 0;
    let samples = 0;
    const probe = (async () => {
      while (running) {
        const started = performance.now();
        await fetch(`${base}/api/health`).then((r) => r.arrayBuffer());
        maxMs = Math.max(maxMs, performance.now() - started);
        samples += 1;
        await new Promise((r) => setTimeout(r, 25));
      }
    })();
    const started = performance.now();
    try {
      return await job();
    } finally {
      const wallMs = Math.round(performance.now() - started);
      running = false;
      await probe;
      console.log(JSON.stringify({ job: label, wallMs, healthSamples: samples, maxHealthLatencyMs: Math.round(maxMs) }));
    }
  }

  const upload = (bytes: Uint8Array, name: string, extra: Record<string, string> = {}) => {
    const form = new FormData();
    form.set("backup", new Blob([new Uint8Array(bytes)]), name);
    for (const [k, v] of Object.entries(extra)) form.set(k, v);
    return form;
  };
  const expectOk = async (response: Response) => {
    if (!response.ok) throw new Error(`${response.url} -> ${response.status} ${await response.text()}`);
    return response;
  };

  const inspected = await withHealthProbe("POST /api/businesses/import/inspect (.manager)", async () =>
    (await expectOk(await fetch(`${base}/api/businesses/import/inspect`, { method: "POST", headers, body: upload(managerFile, "s.manager") }))).json());
  console.log("  inspect summary: salesInvoicesCount =", inspected.summary.salesInvoicesCount);

  const imported = await withHealthProbe("POST /api/businesses/import (.manager)", async () =>
    (await expectOk(await fetch(`${base}/api/businesses/import`, { method: "POST", headers, body: upload(managerFile, "s.manager", { documentStatus: "posted" }) }))).json());
  console.log("  imported business:", imported.businessId, "invoices:", imported.summary.salesInvoicesCount);

  const backup = await withHealthProbe(`GET /api/businesses/[id]/backup`, async () =>
    new Uint8Array(await (await expectOk(await fetch(`${base}/api/businesses/${imported.businessId}/backup`, { headers }))).arrayBuffer()));
  console.log("  backup bytes:", backup.byteLength);
  // Second run: the first request to a route also pays for loading its server chunk.
  await withHealthProbe(`GET /api/businesses/[id]/backup (warm route)`, async () =>
    (await expectOk(await fetch(`${base}/api/businesses/${imported.businessId}/backup`, { headers }))).arrayBuffer());

  const backupInspect = await withHealthProbe("POST /api/businesses/import/inspect (.erpbackup)", async () =>
    (await expectOk(await fetch(`${base}/api/businesses/import/inspect`, { method: "POST", headers, body: upload(backup, "b.erpbackup") }))).json());
  console.log("  manifest formatVersion:", backupInspect.manifest.formatVersion);

  const restored = await withHealthProbe("POST /api/businesses/import (.erpbackup, integrity check)", async () =>
    (await expectOk(await fetch(`${base}/api/businesses/import`, { method: "POST", headers, body: upload(backup, "b.erpbackup") }))).json());
  console.log("  restored business:", restored.businessId);

  const system = new Database(path.join(dataDir, "system", "system.sqlite"), { readonly: true });
  const { directory_key: directoryKey } = system.prepare("SELECT directory_key FROM businesses WHERE id = ?").get(imported.businessId) as { directory_key: string };
  system.close();
  const businessDb = new Database(path.join(dataDir, "businesses", directoryKey, "business.sqlite"), { readonly: true });
  const ids = (businessDb.prepare("SELECT id FROM sales_invoices ORDER BY rowid LIMIT 100").all() as Array<{ id: string }>).map((r) => r.id);
  businessDb.close();

  const zipBytes = await withHealthProbe("POST batch-pdf (100 sales invoices)", async () =>
    new Uint8Array(await (await expectOk(await fetch(`${base}/api/businesses/${imported.businessId}/documents/sales-invoice/batch-pdf`, {
      method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ documentIds: ids }),
    }))).arrayBuffer()));
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(zipBytes);
  const pdfNames = Object.keys(zip.files).filter((n) => n.endsWith(".pdf"));
  console.log("  zip bytes:", zipBytes.byteLength, "pdf entries:", pdfNames.length);
  if (pdfNames.length !== ids.length) throw new Error(`expected ${ids.length} PDFs, got ${pdfNames.length}`);

  // Client disconnect mid-download: the worker must be terminated, the server keeps serving.
  await withHealthProbe("POST batch-pdf aborted after first chunk", async () => {
    const controller = new AbortController();
    const response = await fetch(`${base}/api/businesses/${imported.businessId}/documents/sales-invoice/batch-pdf`, {
      method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ documentIds: ids }), signal: controller.signal,
    });
    const reader = response.body!.getReader();
    await reader.read();
    controller.abort();
    await reader.cancel().catch(() => undefined);
  });
  await new Promise((r) => setTimeout(r, 1500));
  const health = await (await fetch(`${base}/api/health`)).json();
  console.log("  health after abort:", health.status, health.memory ? `rss=${health.memory.rssMb}MB` : "");

  const errors = serverLog.join("").split("\n").filter((l) => /error|worker/i.test(l) && !/Failed to generate PDF/.test(l));
  if (errors.length) console.log("server log lines mentioning error/worker:\n" + errors.slice(0, 20).join("\n"));
  console.log("OK");
} finally {
  stop();
}
process.exit(0);
