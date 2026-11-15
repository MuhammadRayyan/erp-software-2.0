import { defineConfig, devices } from "@playwright/test";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";

const root = process.env.ERP_BROWSER_DATA_DIR ?? mkdtempSync(path.join(tmpdir(), "erp-browser-"));
process.env.ERP_BROWSER_DATA_DIR = root;
process.env.ERP_BROWSER_META = path.join(root, "fixture.json");
const defaultDistDir = existsSync(path.resolve(process.cwd(), ".next-validate")) ? ".next-validate" : ".next";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: ["sprint-2-hardening.spec.ts", "sprint-3-modernization.spec.ts"],
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: "list",
  outputDir: "test-results/sprint3",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://localhost:3312",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "node --import tsx scripts/prepare-sprint3-fixture.ts && npm run start -- -p 3312",
    url: "http://localhost:3312/api/health",
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      NODE_ENV: "production",
      ERP_DATA_DIR: root,
      ERP_BROWSER_META: process.env.ERP_BROWSER_META,
      NEXT_DIST_DIR: process.env.ERP_BROWSER_DIST_DIR ?? defaultDistDir,
      ERP_MIGRATION_MODE: "external",
      BETTER_AUTH_SECRET: randomBytes(48).toString("hex"),
      SETUP_KEY: randomBytes(48).toString("hex"),
      APP_DOMAIN: "localhost:3312",
      BETTER_AUTH_URL: "http://localhost:3312",
      BETTER_AUTH_TRUSTED_ORIGINS: "http://localhost:3312",
    },
  },
});
