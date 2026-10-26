import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { reconcileBusinessDatabase } from "../src/core/db/reconciliation";
import { login } from "./helpers/session";

type Fixture = { businessId: string; foreignBusinessId: string; databasePath: string; payrollDatabasePath: string; customerId: string; supplierId: string; bankAccountId: string; taxCodeId: string; incomeAccountId: string; expenseAccountId: string; payslipId: string };
function fixture(): Fixture { return JSON.parse(readFileSync(process.env.ERP_BROWSER_META!, "utf8")); }
function query<T>(sql: string, ...args: string[]): T {
  return queryIn<T>(fixture().databasePath, sql, ...args);
}
function queryIn<T>(databasePath: string, sql: string, ...args: string[]): T {
  if (!path.resolve(databasePath).startsWith(path.resolve(process.env.ERP_BROWSER_DATA_DIR!)+path.sep)) throw new Error("Non-fixture database rejected");
  const db = new Database(databasePath, { readonly: true });
  try { return db.prepare(sql).get(...args) as T; } finally { db.close(); }
}
async function fillQuote(page: Page, purchase: boolean) {
  const f = fixture();
  await page.getByLabel(purchase ? "Supplier" : "Customer", { exact: true }).selectOption(purchase ? f.supplierId : f.customerId);
  await page.getByLabel("Line 1 description", { exact: true }).fill("Synthetic acceptance services");
  await page.getByLabel("Line 1 quantity", { exact: true }).fill("2");
  await page.getByLabel("Line 1 rate", { exact: true }).fill("100.00");
  await page.getByLabel(purchase ? "Line 1 expense account" : "Line 1 sales account", { exact: true }).selectOption(purchase ? f.expenseAccountId : f.incomeAccountId);
  await page.getByLabel("Default Tax:", { exact: true }).selectOption(f.taxCodeId);
}

test("assigned business/module routes and export boundaries reject another business", async ({ page }) => {
  const f = fixture();
  await login(page, "warehouse");
  await expect(page.getByText("Acceptance private business", { exact: true })).toHaveCount(0);
  await page.goto(`/b/${f.foreignBusinessId}/overview`);
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toHaveCount(0);
  expect((await page.request.get(`/api/businesses/${f.foreignBusinessId}/documents/sales-invoice/unknown/pdf`)).status()).toBe(403);
  await page.goto(`/b/${f.businessId}/sales/invoices`);
  await expect(page.getByRole("heading", { name: /module access required|access denied/i })).toBeVisible();
});

for (const purchase of [false, true]) {
  test(`${purchase ? "purchase" : "sales"} quote → order → invoice → settlement preserves linkage and journals`, async ({ page }) => {
    const f = fixture(), area = purchase ? "purchases" : "sales";
    await login(page);
    await page.goto(`/b/${f.businessId}/${area}/quotes/new`);
    await fillQuote(page, purchase);
    await page.getByRole("button", { name: "Save Draft Quote", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/${area}/quotes/[a-f0-9-]{36}(?:\\?.*)?$`));
    const quoteId = new URL(page.url()).pathname.split("/").pop()!;
    await page.getByRole("button", { name: "Issue Quote", exact: true }).click();
    await page.getByRole("button", { name: /convert to order/i }).click();
    await expect(page).toHaveURL(new RegExp(`/${area}/orders/[a-f0-9-]{36}(?:\\?.*)?$`));
    const orderId = new URL(page.url()).pathname.split("/").pop()!;
    await page.getByRole("button", { name: /issue order|activate order/i }).click();
    await page.getByRole("button", { name: /convert to invoice|create invoice|create bill/i }).click();
    await expect(page).toHaveURL(new RegExp(`/${area}/invoices/[a-f0-9-]{36}(?:\\?.*)?$`));
    const invoiceId = new URL(page.url()).pathname.split("/").pop()!;
    await page.getByRole("button", { name: /post invoice|post bill/i }).click();
    await expect.poll(() => query<{ document_status: string }>(`SELECT document_status FROM ${purchase ? "purchase_invoices" : "sales_invoices"} WHERE id=?`, invoiceId).document_status).toBe("posted");
    const table = purchase ? "purchase_invoices" : "sales_invoices";
    const row = query<{ document_status: string; total_minor: number; order_id: string }>(`SELECT document_status,total_minor,${purchase ? "purchase_order_id" : "sales_order_id"} AS order_id FROM ${table} WHERE id=?`, invoiceId);
    expect(row).toEqual({ document_status: "posted", total_minor: 20000, order_id: orderId });
    const order = query<{ quote_id: string }>(`SELECT ${purchase ? "purchase_quote_id" : "sales_quote_id"} AS quote_id FROM ${purchase ? "purchase_orders" : "sales_orders"} WHERE id=?`, orderId);
    expect(order.quote_id).toBe(quoteId);
    const journal = query<{ debit: number; credit: number; lines: number }>("SELECT SUM(jl.debit_minor) debit,SUM(jl.credit_minor) credit,COUNT(*) lines FROM journal_lines jl JOIN journal_entries je ON je.id=jl.journal_entry_id WHERE je.source_id=? AND je.status='posted'", invoiceId);
    expect(journal.debit).toBe(journal.credit); expect(journal.lines).toBeGreaterThanOrEqual(2);
    const pdf = await page.request.get(`/api/businesses/${f.businessId}/documents/${purchase ? "purchase-invoice" : "sales-invoice"}/${invoiceId}/pdf`);
    expect(pdf.status()).toBe(200); expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
    await page.screenshot({ path: `test-results/acceptance/${area}-posted.png`, fullPage: true });
    await page.getByRole("link", { name: purchase ? "Record Payment" : "Record Receipt", exact: true }).click();
    await page.getByLabel(/Bank \/ Cash Account/).selectOption(f.bankAccountId);
    await page.getByLabel(/^Amount (Paid|Received)/).fill("200.00");
    await page.getByRole("button", { name: purchase ? "Post Payment" : "Post Receipt", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/${area}/${purchase ? "payments" : "receipts"}/[a-f0-9-]{36}(?:\\?.*)?$`));
    const settlementId = new URL(page.url()).pathname.split("/").pop()!;
    const allocations = query<{ paid: number }>(`SELECT SUM(amount_minor) paid FROM ${purchase ? "supplier_payment_allocations" : "receipt_allocations"} WHERE ${purchase ? "purchase_invoice_id" : "sales_invoice_id"}=?`, invoiceId);
    expect(allocations.paid).toBe(20000);
    const settlementJournal = query<{ debit: number; credit: number }>("SELECT SUM(jl.debit_minor) debit,SUM(jl.credit_minor) credit FROM journal_lines jl JOIN journal_entries je ON je.id=jl.journal_entry_id WHERE je.source_id=? AND je.status='posted'", settlementId);
    expect(settlementJournal.debit).toBe(20000); expect(settlementJournal.credit).toBe(20000);
  });
}

test("payroll draft → posted → void renders correctly and reconciles", async ({ page }) => {
  const f = fixture(); await login(page);
  await page.goto(`/b/${f.foreignBusinessId}/payroll/payslips/${f.payslipId}`);
  await page.getByRole("button", { name: "Post to Ledger", exact: true }).click();
  await expect(page.getByRole("button", { name: "Void / Unpost", exact: true })).toBeVisible();
  expect(queryIn<{ n: number }>(f.payrollDatabasePath, "SELECT COUNT(*) n FROM journal_entries WHERE source_id=? AND source_type='payslip'", f.payslipId).n).toBe(1);
  await expect(page.getByRole("button", { name: "Post to Ledger", exact: true })).toHaveCount(0);
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Void / Unpost", exact: true }).click();
  await expect(page.getByRole("button", { name: "Void / Unpost", exact: true })).toHaveCount(0);
  expect(queryIn<{ document_status: string }>(f.payrollDatabasePath, "SELECT document_status FROM payslips WHERE id=?", f.payslipId).document_status).toBe("void");
  const db = new Database(f.payrollDatabasePath, { readonly: true });
  try { expect(Object.values(reconcileBusinessDatabase(db)).every(n => n === 0)).toBe(true); } finally { db.close(); }
});

test("a valid direct Server Action payload works for a creator and is denied for a viewer", async ({ page }) => {
  const f = fixture();
  const manifest = JSON.parse(readFileSync(path.join(process.env.ERP_BROWSER_DIST_DIR ?? ".next-validate", "server/server-reference-manifest.json"), "utf8"));
  const action = Object.entries(manifest.node as Record<string, { exportedName?: string }>).find(([, meta]) => meta.exportedName === "createCustomerAction")?.[0];
  expect(action).toBeTruthy();
  const post = (name: string) => page.request.post(`/b/${f.businessId}/customers/new`, {
    headers: { "Next-Action": action!, Origin: new URL(page.url()).origin, "Content-Type": "text/plain;charset=UTF-8" },
    data: JSON.stringify([f.businessId, { name, isActive: true }]),
  });
  await login(page, "creator");
  await post("Acceptance RPC allowed");
  expect(query<{ n: number }>("SELECT COUNT(*) n FROM customers WHERE name=?", "Acceptance RPC allowed").n).toBe(1);
  await page.context().clearCookies();
  await login(page, "salesviewer");
  const denied = await post("Acceptance RPC denied");
  expect([403, 500]).toContain(denied.status());
  expect(query<{ n: number }>("SELECT COUNT(*) n FROM customers WHERE name=?", "Acceptance RPC denied").n).toBe(0);
});

test("keyboard validation recovery and long mobile list stay usable", async ({ page }) => {
  const f = fixture(); await login(page);
  await page.goto(`/b/${f.businessId}/payroll/payslips/new`);
  const period = page.getByLabel("Period Description");
  await period.fill("Preserve this keyboard input");
  await page.getByRole("button", { name: "Save as Draft", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("alert").filter({ hasText: "Please select an employee" })).toBeVisible();
  await expect(period).toHaveValue("Preserve this keyboard input");
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe("BODY");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/b/${f.businessId}/customers`);
  await expect(page.getByText("Acceptance long list 00", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: "test-results/acceptance/mobile-customers.png", fullPage: true });
});
