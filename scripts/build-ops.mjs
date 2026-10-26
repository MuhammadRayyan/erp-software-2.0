import { build } from "esbuild";
await build({
  entryPoints: ["scripts/ops.ts"], outfile: ".ops/ops.cjs", bundle: true, platform: "node",
  target: "node22", format: "cjs", external: ["better-sqlite3"], tsconfig: "tsconfig.json",
});
