import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { browserDataDir, browserServerTmpDir } from "./tests/e2e/browser-data-dir";
// Specs import src/core/db modules (server-only); resolve that marker package to its
// empty server build in the runner and worker processes, which load this config first.
import "./scripts/server-only-node.mjs";

// One production server on disposable data serves every browser spec. The fixture
// (scripts/prepare-acceptance-fixture.ts) seeds the demo business plus the extra
// businesses, users and records the specs need, and writes their ids to ERP_BROWSER_META.
const root = browserDataDir();
// Specs that read the databases directly (src/core/db/paths) resolve them from the
// same disposable directory as the server; workers inherit this environment.
process.env.ERP_DATA_DIR = root;
// ERP_BROWSER_PORT lets several shards run side by side on one machine.
const port = Number(process.env.ERP_BROWSER_PORT ?? 3310);
const baseURL = `http://localhost:${port}`;
const defaultDistDir = existsSync(path.resolve(process.cwd(), ".next-validate")) ? ".next-validate" : ".next";

export default defineConfig({
  testDir: "./tests/e2e",
  globalTeardown: "./tests/e2e/global-teardown.ts",
  // Specs share one database and some assert on exact data, so they run one at a time.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  outputDir: "test-results/browser",
  reporter: [["list"], ["json", { outputFile: "test-results/browser-summary.json" }]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    actionTimeout: 20_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    // Security, permission and release-gate checks. Run first, on the freshest data.
    {
      name: "gate",
      testMatch: ["hardening.spec.ts", "acceptance.spec.ts", "pillars.spec.ts", "sprint-2-hardening.spec.ts", "sprint-3-modernization.spec.ts"],
    },
    // Module workflows (sales, purchases, inventory, banking, tax, settings, ...).
    {
      name: "workflows",
      testIgnore: ["hardening.spec.ts", "acceptance.spec.ts", "pillars.spec.ts", "sprint-2-hardening.spec.ts", "sprint-3-modernization.spec.ts"],
    },
  ],
  webServer: {
    command: `node --import tsx --import ./scripts/server-only-node.mjs scripts/prepare-acceptance-fixture.ts && npm run start -- -p ${port}`,
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      NODE_ENV: "production",
      ERP_DATA_DIR: root,
      TMPDIR: browserServerTmpDir(root),
      ERP_BROWSER_META: path.join(root, "fixture.json"),
      NEXT_DIST_DIR: process.env.ERP_BROWSER_DIST_DIR ?? defaultDistDir,
      ERP_MIGRATION_MODE: "external",
      BETTER_AUTH_SECRET: randomBytes(48).toString("hex"),
      SETUP_KEY: randomBytes(48).toString("hex"),
      APP_DOMAIN: `localhost:${port}`,
      BETTER_AUTH_URL: baseURL,
      BETTER_AUTH_TRUSTED_ORIGINS: baseURL,
      SENTRY_DSN: "http://synthetic@127.0.0.1:9/1",
    },
  },
});
