// Bundles the worker-thread entries (src/core/workers/*.worker.ts) into
// dist-workers/*.cjs. Runs before `next build`; next.config.ts traces the
// bundles into the standalone output (and so into the Docker image) through
// outputFileTracingIncludes. Native/external packages are resolved at runtime
// from the standalone node_modules (they are serverExternalPackages there).
//
// ERP_WORKER_CONDITIONS (comma-separated) adds export conditions to the
// migration bundle, e.g. "react-server"; `server-only` is always stubbed
// because workers run outside Next's react-server bundling.
import { build } from "esbuild";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const outdir = "dist-workers";
const extraConditions = (process.env.ERP_WORKER_CONDITIONS ?? "").split(",").map((c) => c.trim()).filter(Boolean);
const external = ["better-sqlite3", "puppeteer-core"];

rmSync(outdir, { recursive: true, force: true });
mkdirSync(outdir, { recursive: true });
const stubDir = path.join(outdir, ".stubs");
mkdirSync(stubDir, { recursive: true });
const serverOnlyStub = path.join(stubDir, "server-only.js");
writeFileSync(serverOnlyStub, "// server-only marker: no-op inside worker threads\n");

const entries = [
  // Server-side services only: resolve like Next resolves route handlers.
  { name: "migration.worker", conditions: ["react-server", ...extraConditions] },
  // @react-pdf/renderer needs the full (non react-server) React build.
  { name: "document-pdf.worker", conditions: [...extraConditions] },
];

for (const entry of entries) {
  const result = await build({
    entryPoints: [`src/core/workers/${entry.name}.ts`],
    outfile: path.join(outdir, `${entry.name}.cjs`),
    bundle: true,
    platform: "node",
    target: "node24",
    format: "cjs",
    jsx: "automatic",
    conditions: [...new Set(entry.conditions)],
    mainFields: ["module", "main"],
    external,
    alias: { "server-only": `./${serverOnlyStub}` },
    define: { "process.env.NODE_ENV": '"production"', "import.meta.url": "__import_meta_url" },
    // import.meta.url in ESM dependencies, rewritten for the CJS bundle.
    banner: { js: "const __import_meta_url = require('node:url').pathToFileURL(__filename).href;" },
    tsconfig: "tsconfig.json",
    logLevel: "warning",
    legalComments: "none",
    minifySyntax: true,
    metafile: true,
  });
  const bytes = Object.values(result.metafile.outputs).reduce((sum, output) => sum + output.bytes, 0);
  console.log(`[build-workers] ${entry.name}.cjs ${(bytes / 1024 / 1024).toFixed(1)} MB`);
}
rmSync(stubDir, { recursive: true, force: true });
