import { build } from "esbuild";
await build({
  entryPoints: ["scripts/ops.ts"], outfile: ".ops/ops.cjs", bundle: true, platform: "node",
  target: "node22", format: "cjs", external: ["better-sqlite3"], tsconfig: "tsconfig.json",
});
await build({
  entryPoints: ["scripts/verify-html-pdf.ts"], outfile: ".ops/verify-html-pdf.cjs", bundle: true, platform: "node",
  target: "node22", format: "cjs", external: ["puppeteer"], tsconfig: "tsconfig.json",
});
