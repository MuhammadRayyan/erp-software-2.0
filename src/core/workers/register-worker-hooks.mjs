// Loaded with `--import` into source-mode (tsx) workers. Server modules may
// `import "server-only"`; outside Next's react-server bundling that package
// throws (or is not installed), so workers resolve it to an empty module.
// registerHooks() covers both `import` and `require` (tsx may load a file
// either way). The production esbuild bundle applies the same alias at build
// time (scripts/build-workers.mjs).
import { registerHooks } from "node:module";

const stubUrl = new URL("./server-only-stub.cjs", import.meta.url).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") return { url: stubUrl, format: "commonjs", shortCircuit: true };
    return nextResolve(specifier, context);
  },
});
