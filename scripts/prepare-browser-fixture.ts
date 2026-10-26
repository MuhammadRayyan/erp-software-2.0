import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";

if (!process.env.ERP_DATA_DIR?.includes("erp-browser-") || !process.env.ERP_BROWSER_META) throw new Error("Browser fixtures require an isolated test directory.");
Object.assign(process.env, { ERP_MIGRATION_MODE: "auto", NODE_ENV: "test" });
const { closeAllBusinessConnections } = await import("../src/core/db/business");
const { getSystemSqlite } = await import("../src/core/db/system");
const { seedDemoData } = await import("../src/core/db/seed");
const { auth } = await import("../src/core/auth/auth");
const fixture = await seedDemoData();
for (const [name, capabilities] of [
  ["warehouse", { inventory: ["view"] }],
  ["salesviewer", { sales: ["view"] }],
  ["creator", { sales: ["view", "create"] }],
] as const) {
  const result = await auth.api.signUpEmail({ body: { name, email: `${name}@hardening.invalid`, password: "SyntheticPass123!" } });
  getSystemSqlite().prepare("INSERT INTO business_memberships (id,business_id,user_id,role,modules_json,created_at) VALUES (?,?,?,?,?,?)")
    .run(randomUUID(), fixture.business.id, result.user.id, "standard", JSON.stringify(capabilities), new Date().toISOString());
}
writeFileSync(process.env.ERP_BROWSER_META, JSON.stringify({ businessId: fixture.business.id }));
closeAllBusinessConnections();
console.log("Isolated browser fixture prepared.");
