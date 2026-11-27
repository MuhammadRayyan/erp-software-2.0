import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { build } from "esbuild";

// Database modules `import "server-only"` to keep them out of client bundles.
// The ops tools are plain Node programs, so resolve only that package with the
// `react-server` condition (its empty module); every other package keeps its
// default Node build.
const serverOnlyDir = path.dirname(createRequire(import.meta.url).resolve("server-only"));
const serverOnlyEntry = JSON.parse(readFileSync(path.join(serverOnlyDir, "package.json"), "utf8")).exports["."]["react-server"];
const serverOnly = {
  name: "server-only",
  setup(pluginBuild) {
    pluginBuild.onResolve({ filter: /^server-only$/ }, () => ({ path: path.resolve(serverOnlyDir, serverOnlyEntry) }));
  },
};

await build({
  entryPoints: ["scripts/ops.ts"], outfile: ".ops/ops.cjs", bundle: true, platform: "node",
  target: "node24", format: "cjs", external: ["better-sqlite3"], tsconfig: "tsconfig.json", plugins: [serverOnly],
});
await build({
  entryPoints: ["scripts/verify-html-pdf.ts"], outfile: ".ops/verify-html-pdf.cjs", bundle: true, platform: "node",
  target: "node24", format: "cjs", external: ["puppeteer-core"], tsconfig: "tsconfig.json", plugins: [serverOnly],
});
