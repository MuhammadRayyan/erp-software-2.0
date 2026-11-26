import { randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";

// Explicit test preload: each Node test process receives its own databases,
// including older suites that import database modules before setting env vars.
//
// Everything temporary lives under one per-process root that is removed on
// exit. TMPDIR points at it, so suites that call mkdtempSync(tmpdir()) and the
// headless Chromium used for PDFs (its /tmp shared-memory files) nest inside it
// without each test having to clean up after itself.
const root = mkdtempSync(path.join(tmpdir(), "erp-test-"));
process.env.TMPDIR = root;
process.on("exit", () => {
  try {
    rmSync(root, { recursive: true, force: true });
  } catch {
    // Best effort: never turn a passing run into a failure while cleaning up.
  }
});

process.env.ERP_DATA_DIR = mkdtempSync(path.join(root, "data-"));
process.env.NODE_ENV = "test";
process.env.BETTER_AUTH_SECRET = randomBytes(48).toString("hex");
process.env.SENTRY_DSN = "http://synthetic@127.0.0.1:9/1";

// puppeteer-core ships no browser. Unless one is configured, PDF tests use the
// Chromium that Playwright installs (`npx playwright install chromium`).
if (!process.env.PUPPETEER_EXECUTABLE_PATH) {
  try {
    const playwrightChromium = createRequire(import.meta.url)("playwright-core").chromium.executablePath();
    if (existsSync(playwrightChromium)) process.env.PUPPETEER_EXECUTABLE_PATH = playwrightChromium;
  } catch {
    // Fall back to the renderer's own system-path lookup.
  }
}
