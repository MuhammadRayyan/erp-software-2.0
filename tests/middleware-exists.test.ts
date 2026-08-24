import { test } from "node:test";
import assert from "node:assert";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

/** Recursively collect files matching a predicate (portable across platforms). */
async function collectFiles(
  dir: string,
  predicate: (name: string) => boolean,
  acc: string[] = [],
): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await collectFiles(full, predicate, acc);
    } else if (predicate(entry.name)) {
      acc.push(full);
    }
  }
  return acc;
}

test("src/middleware.ts exists and exports middleware", async () => {
  const middlewarePath = path.join(process.cwd(), "src", "middleware.ts");
  assert.ok(existsSync(middlewarePath), "src/middleware.ts must exist (F1 regression guard)");

  const content = await readFile(middlewarePath, "utf8");
  assert.ok(
    /export\s+async\s+function\s+middleware\b/.test(content) ||
    /export\s+const\s+middleware\s*=/.test(content),
    "src/middleware.ts must export a function named 'middleware'"
  );
  assert.ok(
    /export\s+const\s+config\s*=/.test(content),
    "src/middleware.ts must export a config object with matcher"
  );
});

test("selectClass constant has been fully eliminated from src/", async () => {
  const srcDir = path.join(process.cwd(), "src");
  const files = await collectFiles(srcDir, (name) => name.endsWith(".ts") || name.endsWith(".tsx"));
  const offenders: string[] = [];
  for (const file of files) {
    const content = await readFile(file, "utf8");
    if (content.includes("const selectClass")) {
      offenders.push(path.relative(process.cwd(), file));
    }
  }
  assert.strictEqual(offenders.length, 0, `Found residual 'const selectClass' in: ${offenders.join(", ")}`);
});

test("all API route files declare runtime = nodejs", async () => {
  const apiDir = path.join(process.cwd(), "src", "app", "api");
  const routes = await collectFiles(apiDir, (name) => name === "route.ts");
  assert.ok(routes.length > 0, "Should find at least one API route");
  for (const route of routes) {
    const content = await readFile(route, "utf8");
    assert.ok(
      content.includes('export const runtime = "nodejs"'),
      `Missing runtime = "nodejs" in ${path.relative(process.cwd(), route)}`
    );
  }
});

test("all API route files use requireApiAuth (except auth handler)", async () => {
  const apiDir = path.join(process.cwd(), "src", "app", "api");
  const routes = await collectFiles(apiDir, (name) => name === "route.ts");
  assert.ok(routes.length > 0, "Should find at least one API route");
  for (const route of routes) {
    // The auth catch-all route is the exception — it IS the auth handler
    if (route.includes("[...all]")) continue;
    const content = await readFile(route, "utf8");
    assert.ok(
      content.includes("requireApiAuth"),
      `Missing requireApiAuth in ${path.relative(process.cwd(), route)}`
    );
  }
});

test("eInvoice XML routes both declare Content-Security-Policy", async () => {
  const outbound = path.join(process.cwd(), "src", "app", "api", "businesses", "[businessId]", "einvoicing", "[documentId]", "xml", "route.ts");
  const inbound = path.join(process.cwd(), "src", "app", "api", "businesses", "[businessId]", "purchases", "einvoices", "[documentId]", "xml", "route.ts");
  for (const route of [outbound, inbound]) {
    assert.ok(existsSync(route), `${path.basename(path.dirname(route))} XML route must exist`);
    const content = await readFile(route, "utf8");
    assert.ok(
      content.includes("Content-Security-Policy"),
      `Missing CSP header in ${path.relative(process.cwd(), route)}`
    );
  }
});
