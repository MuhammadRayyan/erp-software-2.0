import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// `npm run check:schema`: migrates a fresh, disposable data directory, creates
// a business through the normal bootstrap/seed path, then fails if the Drizzle
// schema and the migrated SQLite databases differ (tables, columns, indexes,
// UNIQUE constraints). Never touches ./data or ERP_DATA_DIR.

const root = mkdtempSync(path.join(tmpdir(), "erp-schema-check-"));
process.env.ERP_DATA_DIR = root;
process.env.BETTER_AUTH_SECRET ||= randomBytes(48).toString("hex");
process.env.BETTER_AUTH_URL ||= "http://localhost:3000";

let exitCode = 1;
try {
  // Database modules read ERP_DATA_DIR when first imported, so load them after setting it.
  const { migrateDatabases } = await import("../src/core/db/migrate");
  const { seedDemoData } = await import("../src/core/db/seed");
  const { verifyAllSchemas } = await import("./verify-schema-sync");
  migrateDatabases();
  await seedDemoData();
  const { businesses, problems } = verifyAllSchemas();
  if (businesses === 0) console.error("Schema check created no business database to verify.");
  else if (problems > 0) console.error(`\nSchema drift: ${problems} difference(s). Align src/core/db/*-schema.ts with the migrations.`);
  else {
    console.log(`\nDrizzle schema matches freshly migrated system and business databases.`);
    exitCode = 0;
  }
} finally {
  rmSync(root, { recursive: true, force: true });
}
process.exit(exitCode);
