import { randomBytes } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Explicit test preload: each Node test process receives its own databases,
// including older suites that import database modules before setting env vars.
process.env.ERP_DATA_DIR = mkdtempSync(path.join(tmpdir(), "erp-service-test-"));
process.env.NODE_ENV = "test";
process.env.BETTER_AUTH_SECRET = randomBytes(48).toString("hex");
process.env.SENTRY_DSN = "http://synthetic@127.0.0.1:9/1";
