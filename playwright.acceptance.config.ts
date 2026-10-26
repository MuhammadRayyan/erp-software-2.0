import { defineConfig } from "@playwright/test";
import hardening from "./playwright.hardening.config";

export default defineConfig({
  ...hardening,
  testMatch: ["hardening.spec.ts", "acceptance.spec.ts"],
  timeout: 90_000,
  use: { ...hardening.use, actionTimeout: 20_000 },
  outputDir: "test-results/acceptance/browser",
  reporter: [["list"], ["json", { outputFile: "test-results/acceptance/browser-summary.json" }]],
  webServer: {
    ...hardening.webServer,
    command: "node --import tsx scripts/prepare-acceptance-fixture.ts && npm run start -- -p 3310",
    env: {
      ...(hardening.webServer as { env: Record<string, string> }).env,
      SENTRY_DSN: "http://synthetic@127.0.0.1:9/1",
    },
  },
});
