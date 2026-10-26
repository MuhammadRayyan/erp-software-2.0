import "./prepare-browser-fixture";
import { readFileSync, writeFileSync } from "node:fs";
import { getBusinessDb, closeAllBusinessConnections } from "../src/core/db/business";
import { getSystemSqlite } from "../src/core/db/system";
import { createBusiness } from "../src/core/businesses/business-service";
import { createCustomer } from "../src/modules/customers/customer-service";
import { createSupplier } from "../src/modules/suppliers/supplier-service";
import { getBankAccountOptions } from "../src/modules/accounting/services/account-service";
import { saveEmployee, savePayslip } from "../src/modules/payroll/services/payroll-service";

if (!process.env.ERP_DATA_DIR?.includes("erp-browser-") || !process.env.ERP_BROWSER_META) {
  throw new Error("Acceptance fixtures require isolated browser data.");
}
const meta = JSON.parse(readFileSync(process.env.ERP_BROWSER_META, "utf8"));
const admin = getSystemSqlite().prepare("SELECT id FROM user WHERE email=?").get("admin@demo.local") as { id: string };
const { sqlite, paths } = getBusinessDb(meta.businessId, admin.id);
const first = (query: string) => (sqlite.prepare(query).get() as { id: string }).id;
const foreign = createBusiness({ name: "Acceptance private business", country: "United Arab Emirates", currency: "AED", financialYearStartMonth: 1 }, admin.id);
const payroll = getBusinessDb(foreign.id, admin.id);
const employeeId = saveEmployee(foreign.id, admin.id, { name: "Acceptance employee", isActive: true });
const expense = first("SELECT id FROM accounts WHERE type='expense' AND is_active=1 LIMIT 1");
const customerId = createCustomer(meta.businessId, admin.id, { name: "Acceptance flow customer", isActive: true });
const supplierId = createSupplier(meta.businessId, admin.id, { name: "Acceptance flow supplier", isActive: true });
const payrollExpense = (payroll.sqlite.prepare("SELECT id FROM accounts WHERE type='expense' AND is_active=1 LIMIT 1").get() as { id: string }).id;
const payslipId = savePayslip(foreign.id, admin.id, {
  employeeId, date: "2026-10-26", periodDescription: "Acceptance payroll", autoPost: false,
  lines: [{ type: "earnings", description: "Synthetic salary", accountId: payrollExpense, amountMinor: 100000 }],
});
for (let i = 0; i < 45; i++) createCustomer(meta.businessId, admin.id, { name: `Acceptance long list ${String(i).padStart(2, "0")}`, isActive: true });
writeFileSync(process.env.ERP_BROWSER_META, JSON.stringify({
  ...meta, foreignBusinessId: foreign.id, databasePath: paths.database, payrollDatabasePath: payroll.paths.database, payslipId,
  customerId, supplierId,
  bankAccountId: getBankAccountOptions(meta.businessId, admin.id)[0].id,
  taxCodeId: first("SELECT id FROM tax_codes WHERE vat_category='out_of_scope' AND direction='both' LIMIT 1"),
  incomeAccountId: first("SELECT id FROM accounts WHERE type='income' AND is_active=1 LIMIT 1"),
  expenseAccountId: expense,
}));
closeAllBusinessConnections();
console.log("Synthetic acceptance fixture prepared.");
