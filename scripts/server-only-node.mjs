import { registerHooks } from "node:module";

// Database modules start with `import "server-only"` so Next.js refuses to
// bundle them into client code. Outside Next.js the package throws unless it is
// resolved with the `react-server` export condition, which maps it to an empty
// module. Plain Node entry points (tests, db:* scripts, Playwright fixtures)
// preload this file to resolve *only* `server-only` that way. A global
// `--conditions=react-server` would also switch React itself to its server
// build (no hooks), which breaks PDF rendering and UI unit tests.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return nextResolve(specifier, { ...context, conditions: [...context.conditions, "react-server"] });
    }
    return nextResolve(specifier, context);
  },
});
