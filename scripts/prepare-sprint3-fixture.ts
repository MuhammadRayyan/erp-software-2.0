import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";

if (!process.env.ERP_DATA_DIR?.includes("erp-browser-") || !process.env.ERP_BROWSER_META) {
  throw new Error("Browser fixtures require an isolated test directory.");
}
Object.assign(process.env, { ERP_MIGRATION_MODE: "auto", NODE_ENV: "test" });

const { closeAllBusinessConnections, getBusinessDb } = await import("../src/core/db/business");
const { getSystemSqlite } = await import("../src/core/db/system");
const { seedDemoData } = await import("../src/core/db/seed");
const { createBusiness } = await import("../src/core/businesses/business-service");
const { createCustomer } = await import("../src/modules/customers/customer-service");
const { customerInputSchema } = await import("../src/modules/customers/customer-input");
const { auth } = await import("../src/core/auth/auth");

const fixture = await seedDemoData();
getSystemSqlite()
  .prepare("UPDATE user SET is_super_admin = 1 WHERE id = ?")
  .run(fixture.admin.id);

const secondary = createBusiness(
  {
    name: "Abu Dhabi Branch LLC",
    country: "United Arab Emirates",
    currency: "AED",
    financialYearStartMonth: 1,
  },
  fixture.admin.id,
  { enforceQuota: false },
);

const secondarySqlite = getBusinessDb(secondary.id, fixture.admin.id).sqlite;
const accountNow = new Date().toISOString();
const insertVirtualAccount = secondarySqlite.prepare(
  "INSERT INTO accounts (id, name, type, subtype, is_system, is_active, created_at, updated_at) VALUES (?, ?, 'income', 'other_income', 0, 1, ?, ?)",
);
for (let i = 1; i <= 40; i += 1) {
  const padded = String(i).padStart(2, "0");
  insertVirtualAccount.run(`acct-vacct-${padded}`, `VAcct ${padded}`, accountNow, accountNow);
}
createCustomer(
  secondary.id,
  fixture.admin.id,
  customerInputSchema.parse({ name: "Abu Dhabi Customer LLC" }),
);

for (const [name, capabilities] of [
  ["warehouse", { inventory: ["view"] }],
  ["salesviewer", { sales: ["view"] }],
  ["creator", { sales: ["view", "create"] }],
  ["settingsviewer", { settings: ["view"] }],
] as const) {
  const result = await auth.api.signUpEmail({
    body: {
      name,
      email: `${name}@hardening.invalid`,
      password: "SyntheticPass123!",
    },
  });
  getSystemSqlite()
    .prepare(
      "INSERT INTO business_memberships (id,business_id,user_id,role,modules_json,created_at) VALUES (?,?,?,?,?,?)",
    )
    .run(
      randomUUID(),
      fixture.business.id,
      result.user.id,
      "standard",
      JSON.stringify(capabilities),
      new Date().toISOString(),
    );
}

writeFileSync(
  process.env.ERP_BROWSER_META,
  JSON.stringify({
    businessId: fixture.business.id,
    secondaryBusinessId: secondary.id,
  }),
);
closeAllBusinessConnections();
console.log("Isolated Sprint 3 browser fixture prepared.");
