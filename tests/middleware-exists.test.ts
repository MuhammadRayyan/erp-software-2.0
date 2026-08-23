import { test } from "node:test";
import assert from "node:assert";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { execSync } from "node:child_process";

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

test("selectClass constant has been fully eliminated from src/", () => {
  try {
    const output = execSync('findstr /S /M /C:"const selectClass" src\\*.tsx src\\*.ts', {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    assert.fail(`Found residual 'const selectClass' in: ${output.trim()}`);
  } catch (error) {
    // findstr returns exit code 1 when no matches found — that is the expected success case
    if ((error as { status?: number }).status === 1) return;
    // Re-throw if it's an actual assertion failure from assert.fail above
    throw error;
  }
});

test("all API route files declare runtime = nodejs", async () => {
  const apiDir = path.join(process.cwd(), "src", "app", "api");
  const routes = execSync(`where /r "${apiDir}" route.ts`, { encoding: "utf8" }).trim().split(/\r?\n/);
  assert.ok(routes.length > 0, "Should find at least one API route");
  for (const route of routes) {
    const content = await readFile(route.trim(), "utf8");
    assert.ok(
      content.includes('export const runtime = "nodejs"'),
      `Missing runtime = "nodejs" in ${path.relative(process.cwd(), route.trim())}`
    );
  }
});

test("all API route files use requireApiAuth (except auth handler)", async () => {
  const apiDir = path.join(process.cwd(), "src", "app", "api");
  const routes = execSync(`where /r "${apiDir}" route.ts`, { encoding: "utf8" }).trim().split(/\r?\n/);
  for (const route of routes) {
    const trimmed = route.trim();
    // The auth catch-all route is the exception — it IS the auth handler
    if (trimmed.includes("[...all]")) continue;
    const content = await readFile(trimmed, "utf8");
    assert.ok(
      content.includes("requireApiAuth"),
      `Missing requireApiAuth in ${path.relative(process.cwd(), trimmed)}`
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
