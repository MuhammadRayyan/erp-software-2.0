import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { generateUaeTrnWithChecksum } from "../src/modules/tax/trn-validation";
import { login } from "./helpers/session";

type Fixture = {
  businessId: string;
  foreignBusinessId: string;
  databasePath: string;
  customerId: string;
  supplierId: string;
  bankAccountId: string;
  taxCodeId: string;
  incomeAccountId: string;
  expenseAccountId: string;
};

function fixture(): Fixture {
  return JSON.parse(readFileSync(process.env.ERP_BROWSER_META!, "utf8"));
}

function query<T>(sql: string, ...args: string[]): T {
  const dbPath = fixture().databasePath;
  if (!path.resolve(dbPath).startsWith(path.resolve(process.env.ERP_BROWSER_DATA_DIR!) + path.sep)) {
    throw new Error("Non-fixture database rejected");
  }
  const db = new Database(dbPath, { readonly: true });
  try {
    return db.prepare(sql).get(...args) as T;
  } finally {
    db.close();
  }
}

test("Pillar 1: comparative P&L drill-down modal, saved custom report view, and AR/AP drill-down links", async ({ page }) => {
  const f = fixture();
  await login(page, "admin");

  // 1. Comparative P&L + drill-down modal
  await page.goto(`/b/${f.businessId}/reports/profit-loss`);
  await expect(page.getByRole("heading", { name: "Profit & Loss", exact: true })).toBeVisible();

  await page.locator('select[name="compareMode"]').selectOption("prior_period");
  await page.getByRole("button", { name: "Update", exact: true }).click();
  await expect(page).toHaveURL(/compareMode=prior_period/);
  await expect(page.getByRole("columnheader", { name: "Variance" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Var %" })).toBeVisible();

  // Custom date inputs toggle immediately client-side before submitting & submit cleanly
  await page.locator('select[name="compareMode"]').selectOption("custom");
  await expect(page.locator('input[name="compareDateFrom"]')).toBeVisible();
  await expect(page.locator('input[name="compareDateTo"]')).toBeVisible();
  await page.locator('input[name="compareDateFrom"]').fill("2025-01-01");
  await page.locator('input[name="compareDateTo"]').fill("2025-12-31");
  await page.getByRole("button", { name: "Update", exact: true }).click();
  await expect(page).toHaveURL(/compareMode=custom/);
  await expect(page).toHaveURL(/compareDateFrom=2025-01-01/);
  await expect(page.getByRole("columnheader", { name: "2025-01-01 – 2025-12-31" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Variance" })).toBeVisible();
  await page.locator('select[name="compareMode"]').selectOption("prior_period");
  await expect(page.locator('input[name="compareDateFrom"]')).toHaveCount(0);

  // Balance Sheet custom date input toggles immediately client-side & submits cleanly
  await page.goto(`/b/${f.businessId}/reports/balance-sheet`);
  await expect(page.getByRole("heading", { name: "Balance Sheet", exact: true })).toBeVisible();
  await page.locator('select[name="compareMode"]').selectOption("custom");
  await expect(page.locator('input[name="compareThroughDate"]')).toBeVisible();
  await page.locator('input[name="compareThroughDate"]').fill("2025-12-31");
  await page.getByRole("button", { name: "Update", exact: true }).click();
  await expect(page).toHaveURL(/compareMode=custom/);
  await expect(page).toHaveURL(/compareThroughDate=2025-12-31/);
  await expect(page.getByRole("columnheader", { name: "As of 2025-12-31" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Change" })).toBeVisible();
  await page.goto(`/b/${f.businessId}/reports/profit-loss?compareMode=prior_period`);

  // Click first non-zero balance to open drill-down modal
  const drillBtn = page.locator('button[title^="Drill down into"]').first();
  await expect(drillBtn).toBeVisible();
  await drillBtn.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Voucher" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Net Impact" })).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).first().click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // 2. Save custom report view & reopen it from clean P&L URL
  await page.getByRole("button", { name: "Save View", exact: true }).click();
  await page.getByLabel("View Name *").fill("E2E Comparative View");
  await page.getByLabel(/Description/i).fill("Automated E2E verification view");
  await page.getByRole("dialog").getByRole("button", { name: "Save View", exact: true }).click();
  await expect(page).toHaveURL(/viewId=/);

  await page.goto(`/b/${f.businessId}/reports/profit-loss`);
  const savedSelect = page.getByLabel("Load saved report view");
  await expect(savedSelect).toBeVisible();
  const optionValue = await savedSelect.locator("option", { hasText: "E2E Comparative View" }).getAttribute("value");
  expect(optionValue).toBeTruthy();
  await savedSelect.selectOption(optionValue!);
  await expect(page).toHaveURL(/compareMode=prior_period/);
  await expect(page.getByRole("columnheader", { name: "Variance" })).toBeVisible();

  // 3. Create an unpaid Purchase Invoice so both AR & AP reports have live rows, then verify drill-down links
  await page.goto(`/b/${f.businessId}/purchases/invoices/new`);
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Supplier invoice #", { exact: true }).fill(`SUP-E2E-${Date.now()}`);
  await page.getByLabel("Line 1 description", { exact: true }).fill("AP Drilldown Expense");
  await page.getByLabel("Line 1 quantity", { exact: true }).fill("1");
  await page.getByLabel("Line 1 rate", { exact: true }).fill("200.00");
  await page.getByLabel("Line 1 expense account", { exact: true }).selectOption(f.expenseAccountId);
  await page.getByLabel("Default Tax:", { exact: true }).selectOption(f.taxCodeId);
  await page.getByLabel("Supplier", { exact: true }).selectOption(f.supplierId);
  await expect(page.getByLabel("Supplier", { exact: true })).toHaveValue(f.supplierId);
  await page.getByRole("button", { name: "Create & Post", exact: true }).click();
  await expect(page).toHaveURL(/\/purchases\/invoices\/[a-f0-9-]{36}(?:\?.*)?$/);

  await page.goto(`/b/${f.businessId}/reports/accounts-payable`);
  await expect(page.getByRole("heading", { name: "Accounts Payable", exact: true })).toBeVisible();
  const apDocLink = page.locator('table.data-table tbody a[href*="/purchases/invoices/"]').first();
  await expect(apDocLink).toBeVisible();
  await expect(page.locator('table.data-table tbody a[href*="/reports/supplier-statement?supplierId="]').first()).toBeVisible();
  await apDocLink.click();
  await expect(page).toHaveURL(/\/purchases\/invoices\/[a-f0-9-]{36}/);
});

test("Pillar 1: line-level custom fields in Document Grid & PDF filter", async ({ page }) => {
  const f = fixture();
  await login(page, "admin");

  await page.goto(`/b/${f.businessId}/settings/custom-fields`);
  await page.getByRole("button", { name: /Line Item Fields/i }).click();

  // Create showOnPdf = true line custom field on sales_invoice_line
  await page.getByRole("button", { name: "New Custom Field", exact: true }).first().click();
  await page.getByLabel("Applies to").selectOption("sales_invoice_line");
  await page.getByLabel("Name", { exact: true }).fill("Serial E2E");
  await page.getByRole("button", { name: "Create field", exact: true }).click();
  await expect(page.getByText("Serial E2E", { exact: true })).toBeVisible();

  // Create showOnPdf = false (internal only) line custom field on sales_invoice_line
  await page.getByRole("button", { name: "New Custom Field", exact: true }).first().click();
  await page.getByLabel("Applies to").selectOption("sales_invoice_line");
  await page.getByLabel("Name", { exact: true }).fill("Internal Cost E2E");
  await page.getByLabel(/Show on printed PDFs/i).uncheck();
  await page.getByRole("button", { name: "Create field", exact: true }).click();
  await expect(page.getByText("Internal Cost E2E", { exact: true })).toBeVisible();

  // Fill both columns in DocumentGrid on new sales invoice
  await page.goto(`/b/${f.businessId}/sales/invoices/new`);
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Line 1 description", { exact: true }).fill("Line CF Equipment");
  await page.getByLabel("Line 1 quantity", { exact: true }).fill("1");
  await page.getByLabel("Line 1 rate", { exact: true }).fill("300.00");
  await page.getByLabel("Line 1 sales account", { exact: true }).selectOption(f.incomeAccountId);
  await page.getByLabel("Default Tax:", { exact: true }).selectOption(f.taxCodeId);
  await page.getByLabel("Line 1 Serial E2E", { exact: true }).fill("SN-E2E-777");
  await page.getByLabel("Line 1 Internal Cost E2E", { exact: true }).fill("SECRET-MARGIN-99");
  await page.getByLabel("Customer", { exact: true }).selectOption(f.customerId);
  await expect(page.getByLabel("Customer", { exact: true })).toHaveValue(f.customerId);
  await page.getByRole("button", { name: "Create & Post", exact: true }).click();

  await expect(page).toHaveURL(/\/sales\/invoices\/[a-f0-9-]{36}(?:\?.*)?$/);
  const invoiceId = new URL(page.url()).pathname.split("/").pop()!;

  // Printed preview filters out showOnPdf=false while keeping showOnPdf=true
  await expect(page.getByText("SN-E2E-777")).toBeVisible();
  await expect(page.getByText("SECRET-MARGIN-99")).toHaveCount(0);

  // Both values are persisted in DB for internal line tracking
  const lineIdRow = query<{ id: string }>("SELECT id FROM sales_invoice_lines WHERE invoice_id = ? LIMIT 1", invoiceId);
  const storedCount = query<{ n: number }>("SELECT COUNT(*) n FROM custom_field_values WHERE entity_id = ? AND value IN ('SN-E2E-777', 'SECRET-MARGIN-99')", lineIdRow.id);
  expect(storedCount.n).toBe(2);

  // PDF generation endpoint succeeds
  const pdfRes = await page.request.get(`/api/businesses/${f.businessId}/documents/sales-invoice/${invoiceId}/pdf`);
  expect(pdfRes.status()).toBe(200);
  expect((await pdfRes.body()).subarray(0, 5).toString()).toBe("%PDF-");

  // AR report links directly to the newly posted invoice and customer statement
  await page.goto(`/b/${f.businessId}/reports/accounts-receivable`);
  const arDocLink = page.locator(`table.data-table tbody a[href$="/sales/invoices/${invoiceId}"]`).first();
  await expect(arDocLink).toBeVisible();
  await expect(page.locator(`table.data-table tbody a[href*="/reports/customer-statement?customerId=${f.customerId}"]`).first()).toBeVisible();
  await arDocLink.click();
  await expect(page).toHaveURL(new RegExp(`/sales/invoices/${invoiceId}`));
});

test("Pillar 2: PDC lifecycle + Overview widget, VAT TRN checksum + FAF export, and Payroll WPS .SIF export", async ({ page }) => {
  const f = fixture();
  await login(page, "admin");

  // 1. PDC create -> overview tracker -> deposit -> clear
  await page.goto(`/b/${f.businessId}/banking/pdcs`);
  await expect(page.getByRole("heading", { name: /Post-Dated Cheques/i })).toBeVisible();
  await page.getByRole("button", { name: "Register PDC", exact: true }).click();
  const pdcDialog = page.getByRole("dialog");
  await pdcDialog.getByLabel("Direction", { exact: true }).selectOption("receivable");
  await pdcDialog.getByLabel("Designated Clearing Bank", { exact: true }).selectOption({ index: 0 });
  await pdcDialog.getByLabel("Customer", { exact: true }).selectOption(f.customerId);
  await pdcDialog.getByLabel("Amount", { exact: true }).fill("1500.00");
  await pdcDialog.getByLabel("Cheque Number", { exact: true }).fill("CHQ-E2E-101");
  await pdcDialog.getByLabel("Issuing Bank Name", { exact: true }).fill("Emirates NBD");
  await pdcDialog.getByRole("button", { name: "Register PDC", exact: true }).click();

  const pdcRow = page.locator("table.data-table tbody tr", { hasText: "CHQ-E2E-101" });
  await expect(pdcRow).toBeVisible();
  await expect(pdcRow).toContainText("Held");

  // Overview widget reflects the maturing PDC
  await page.goto(`/b/${f.businessId}/overview`);
  await expect(page.getByRole("heading", { name: /PDC Maturity Tracker/i })).toBeVisible();
  await expect(page.getByText(/1,500\.00/).first()).toBeVisible();

  // Deposit -> Clear
  await page.goto(`/b/${f.businessId}/banking/pdcs`);
  await pdcRow.getByRole("button", { name: "Deposit", exact: true }).click();
  await expect(pdcRow).toContainText("Deposited");
  await pdcRow.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(pdcRow).toContainText("Cleared");

  const pdcJournals = query<{ n: number }>(
    "SELECT COUNT(*) n FROM journal_entries WHERE source_type IN ('pdc_receive', 'pdc_clear') AND status = 'posted'",
  );
  expect(pdcJournals.n).toBeGreaterThanOrEqual(2);

  // Register a second PDC and exercise the Bounce flow in Chromium
  await page.getByRole("button", { name: "Register PDC", exact: true }).click();
  const bouncePdcDialog = page.getByRole("dialog");
  await bouncePdcDialog.getByLabel("Direction", { exact: true }).selectOption("receivable");
  await bouncePdcDialog.getByLabel("Designated Clearing Bank", { exact: true }).selectOption({ index: 0 });
  await bouncePdcDialog.getByLabel("Customer", { exact: true }).selectOption(f.customerId);
  await bouncePdcDialog.getByLabel("Amount", { exact: true }).fill("500.00");
  await bouncePdcDialog.getByLabel("Cheque Number", { exact: true }).fill("CHQ-BOUNCE-202");
  await bouncePdcDialog.getByRole("button", { name: "Register PDC", exact: true }).click();

  const bounceRow = page.locator("table.data-table tbody tr", { hasText: "CHQ-BOUNCE-202" });
  await expect(bounceRow).toBeVisible();
  await bounceRow.getByRole("button", { name: "Bounce", exact: true }).click();
  const bounceModal = page.getByRole("dialog");
  await bounceModal.getByLabel("Bank Return / Bounce Reason").fill("Insufficient funds E2E");
  await bounceModal.getByRole("button", { name: "Confirm Bounce", exact: true }).click();
  await expect(bounceRow).toContainText("Bounced");
  await expect(bounceRow).toContainText("Insufficient funds E2E");

  // 2. Tax TRN checksum verification badge & FAF export endpoint
  const verifiedTrn = generateUaeTrnWithChecksum("10023456789012");
  await page.goto(`/b/${f.businessId}/settings/tax`);
  await page.getByLabel("TRN (15 digits)").fill(verifiedTrn);
  await expect(page.getByText("Verified Checksum", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Save VAT settings", exact: true }).click();
  await expect(page.getByText("VAT registration settings saved.")).toBeVisible();

  await page.goto(`/b/${f.businessId}/tax/vat`);
  await expect(page.getByText("TRN Checksum Verified", { exact: true })).toBeVisible();
  const fafHref = await page.getByRole("link", { name: /Export FTA Audit File/i }).getAttribute("href");
  expect(fafHref).toBeTruthy();
  const fafRes = await page.request.get(fafHref!);
  expect(fafRes.status()).toBe(200);
  expect(fafRes.headers()["content-disposition"]).toContain(".csv");
  const fafCsv = await fafRes.text();
  expect(fafCsv).toContain("CompanyName");
  expect(fafCsv).toContain(verifiedTrn);

  // 3. Payroll WPS (.SIF) export dialog
  await page.goto(`/b/${f.businessId}/settings/business-profile`);
  await page.getByLabel(/MOL \/ MOHRE Establishment ID/i).fill("9988776655443");
  await page.getByLabel(/WPS Bank Routing Code/i).fill("303100001");
  await page.getByRole("button", { name: "Save Business Profile", exact: true }).click();
  await expect(page.getByText(/Business profile and organization branding updated/i)).toBeVisible();

  await page.goto(`/b/${f.businessId}/payroll/employees`);
  await page.getByRole("button", { name: "New Employee", exact: true }).click();
  await page.getByLabel("Full Name *").fill("Tariq WPS E2E");
  await page.getByLabel("Basic Salary (AED)").fill("5000");
  await page.getByLabel(/MOL \/ Labour Card ID/i).fill("12345678901234");
  await page.getByLabel(/Bank Routing Code/i).fill("303100001");
  await page.getByLabel(/Employee IBAN/i).fill("AE070331234567890123456");
  await page.getByRole("button", { name: "Create Employee", exact: true }).click();
  await expect(page.getByText("Tariq WPS E2E")).toBeVisible();

  await page.goto(`/b/${f.businessId}/payroll/payslips/new`);
  const empOption = await page.locator("#employeeId option", { hasText: "Tariq WPS E2E" }).getAttribute("value");
  expect(empOption).toBeTruthy();
  await page.locator("#employeeId").selectOption(empOption!);
  await page.getByLabel("Period Description").fill("E2E WPS Run");
  await page.getByRole("button", { name: "Save & Post to Ledger", exact: true }).click();
  await expect(page).toHaveURL(/\/payroll\/payslips\/[a-f0-9-]{36}(?:\?.*)?$/);

  await page.goto(`/b/${f.businessId}/payroll/payslips`);
  await page.getByRole("button", { name: /Export WPS \(\.SIF\)/i }).click();
  const wpsDialog = page.getByRole("dialog");
  await expect(wpsDialog).toBeVisible();
  await expect(wpsDialog.getByText("Ready to Export", { exact: true })).toBeVisible();
  const sifHref = await wpsDialog.getByRole("link", { name: /Download \.SIF File/i }).getAttribute("href");
  expect(sifHref).toBeTruthy();
  const sifRes = await page.request.get(sifHref!);
  expect(sifRes.status()).toBe(200);
  const sifText = await sifRes.text();
  expect(sifText).toContain("EDR,");
  expect(sifText).toContain("SCR,");
});

test("Pillar 3: selectable per-user approval policy, Maker submission, Approver notification & approval, Maker notification back", async ({ page }) => {
  const f = fixture();

  // 1. Standard user initially has "Can proceed without approval" -> sees "Create & Post"
  await login(page, "standard");
  await page.goto(`/b/${f.businessId}/sales/invoices/new`);
  await expect(page.getByRole("button", { name: "Create & Post", exact: true })).toBeVisible();

  // 2. Admin configures Approval Rule & toggles standard user to "Requires approval before posting"
  await login(page, "admin");
  await page.goto(`/b/${f.businessId}/settings/approvals`);
  await expect(page.getByRole("heading", { name: "Approval Rules & Spend Thresholds", exact: true })).toBeVisible();
  const salesRuleCard = page.locator("div.p-4", { hasText: "Sales Invoice" }).first();
  await salesRuleCard.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Approval rule saved.")).toBeVisible();

  await page.goto(`/b/${f.businessId}/settings/users`);
  const stdCard = page.locator("article", { hasText: "standard@demo.local" });
  await expect(stdCard).toBeVisible();
  const approvalSelect = stdCard.getByLabel(/Approval policy for/i);
  await expect(approvalSelect).toHaveValue("direct");
  await approvalSelect.selectOption("requires_approval");
  await stdCard.getByLabel(/Purchases/i).check();
  await stdCard.getByRole("button", { name: "Save Access", exact: true }).click();
  await expect(page.getByText(/Access updated for/i)).toBeVisible();

  await page.reload();
  await expect(page.locator("article", { hasText: "standard@demo.local" }).getByLabel(/Approval policy for/i)).toHaveValue("requires_approval");

  // 3. Maker logs in -> "Submit for Approval" replaces "Create & Post"
  await login(page, "standard");
  await page.goto(`/b/${f.businessId}/sales/invoices/new`);
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("button", { name: "Submit for Approval", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create & Post", exact: true })).toHaveCount(0);

  await page.getByLabel("Line 1 description", { exact: true }).fill("Maker Approval E2E Service");
  await page.getByLabel("Line 1 quantity", { exact: true }).fill("1");
  await page.getByLabel("Line 1 rate", { exact: true }).fill("750.00");
  await page.getByLabel("Line 1 sales account", { exact: true }).selectOption(f.incomeAccountId);
  await page.getByLabel("Default Tax:", { exact: true }).selectOption(f.taxCodeId);
  await page.getByLabel("Customer", { exact: true }).selectOption(f.customerId);
  await expect(page.getByLabel("Customer", { exact: true })).toHaveValue(f.customerId);
  await page.getByRole("button", { name: "Submit for Approval", exact: true }).click();

  await expect(page).toHaveURL(/\/sales\/invoices\/[a-f0-9-]{36}(?:\?.*)?$/);
  const invoiceId = new URL(page.url()).pathname.split("/").pop()!;
  await expect(page.getByText("Pending Approval").first()).toBeVisible();

  const pendingRow = query<{ document_status: string; invoice_number: string }>(
    "SELECT document_status, invoice_number FROM sales_invoices WHERE id = ?",
    invoiceId,
  );
  expect(pendingRow.document_status).toBe("pending_approval");
  const preApproveJournals = query<{ n: number }>(
    "SELECT COUNT(*) n FROM journal_entries WHERE source_id = ? AND status = 'posted'",
    invoiceId,
  );
  expect(preApproveJournals.n).toBe(0);

  // 4. Approver (Admin) sees NotificationBell badge -> opens notification -> approves on /approvals
  await login(page, "admin");
  await page.goto(`/b/${f.businessId}/overview`);
  const adminBell = page.getByRole("button", { name: "Notifications", exact: true });
  await expect(adminBell).toBeVisible();
  await expect(adminBell.locator("span")).toBeVisible();
  await adminBell.click();
  const notifItem = page.getByRole("button", { name: new RegExp(pendingRow.invoice_number) });
  await expect(notifItem).toBeVisible();
  await notifItem.click();

  await expect(page).toHaveURL(new RegExp(`/b/${f.businessId}/approvals`));
  const approvalRow = page.locator("table.data-table tbody tr", { hasText: pendingRow.invoice_number });
  await expect(approvalRow).toBeVisible();
  await approvalRow.getByRole("button", { name: /Approve & Post/i }).click();
  await expect(page.getByText(/Submitter notified/i)).toBeVisible();

  await expect
    .poll(() => query<{ document_status: string }>("SELECT document_status FROM sales_invoices WHERE id = ?", invoiceId).document_status)
    .toBe("posted");
  const postApproveJournals = query<{ n: number }>(
    "SELECT COUNT(*) n FROM journal_entries WHERE source_id = ? AND status = 'posted'",
    invoiceId,
  );
  expect(postApproveJournals.n).toBe(1);

  // 5. Maker logs back in -> sees NotificationBell badge for approval decision -> navigates to posted invoice
  await login(page, "standard");
  await page.goto(`/b/${f.businessId}/overview`);
  const makerBell = page.getByRole("button", { name: "Notifications", exact: true });
  await expect(makerBell.locator("span")).toBeVisible();
  await makerBell.click();
  const decisionItem = page.getByRole("button", { name: new RegExp(`Approved.*${pendingRow.invoice_number}|${pendingRow.invoice_number}.*Approved`, "i") });
  await expect(decisionItem).toBeVisible();
  await decisionItem.click();

  await expect(page).toHaveURL(new RegExp(`/b/${f.businessId}/sales/invoices/${invoiceId}`));
  await expect(page.getByText("Posted", { exact: true }).first()).toBeVisible();

  // 6. Negative path: Maker submits another invoice -> Admin rejects to draft -> Maker notified & can resubmit from view page
  await page.goto(`/b/${f.businessId}/sales/invoices/new`);
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Line 1 description", { exact: true }).fill("Reject-Resubmit E2E Service");
  await page.getByLabel("Line 1 quantity", { exact: true }).fill("1");
  await page.getByLabel("Line 1 rate", { exact: true }).fill("250.00");
  await page.getByLabel("Line 1 sales account", { exact: true }).selectOption(f.incomeAccountId);
  await page.getByLabel("Default Tax:", { exact: true }).selectOption(f.taxCodeId);
  await page.getByLabel("Customer", { exact: true }).selectOption(f.customerId);
  await expect(page.getByLabel("Customer", { exact: true })).toHaveValue(f.customerId);
  await page.getByRole("button", { name: "Submit for Approval", exact: true }).click();
  await expect(page).toHaveURL(/\/sales\/invoices\/[a-f0-9-]{36}(?:\?.*)?$/);
  const rejInvoiceId = new URL(page.url()).pathname.split("/").pop()!;
  const rejRow = query<{ invoice_number: string }>("SELECT invoice_number FROM sales_invoices WHERE id = ?", rejInvoiceId);

  await login(page, "admin");
  await page.goto(`/b/${f.businessId}/approvals`);
  const rejApprovalRow = page.locator("table.data-table tbody tr", { hasText: rejRow.invoice_number });
  await expect(rejApprovalRow).toBeVisible();
  await rejApprovalRow.getByRole("button", { name: "Reject", exact: true }).click();
  const rejectModal = page.getByRole("dialog");
  await rejectModal.getByLabel("Rejection Reason / Feedback").fill("Clarify delivery terms");
  await rejectModal.getByRole("button", { name: "Reject to Draft", exact: true }).click();
  await expect(page.getByText(/Returned .* to draft/i)).toBeVisible();

  await login(page, "standard");
  await page.goto(`/b/${f.businessId}/overview`);
  const makerRejBell = page.getByRole("button", { name: "Notifications", exact: true });
  await expect(makerRejBell.locator("span")).toBeVisible();
  await makerRejBell.click();
  const rejNotifItem = page.getByRole("button", { name: new RegExp(`Rejected.*${rejRow.invoice_number}|${rejRow.invoice_number}.*Clarify delivery terms`, "i") });
  await expect(rejNotifItem).toBeVisible();
  await rejNotifItem.click();
  await expect(page).toHaveURL(new RegExp(`/b/${f.businessId}/sales/invoices/${rejInvoiceId}`));
  await expect(page.getByText(/Returned to Draft/i)).toBeVisible();
  await expect(page.getByText(/Clarify delivery terms/i)).toBeVisible();
  await page.getByRole("button", { name: "Submit for Approval", exact: true }).click();
  await expect(page.getByText("Pending Approval").first()).toBeVisible();

  // 7. Batch post from list table when Maker requiresApproval=true shows "Submitted ... for approval" toast
  await page.goto(`/b/${f.businessId}/sales/invoices/new`);
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Line 1 description", { exact: true }).fill("Batch Approval Draft Line");
  await page.getByLabel("Line 1 quantity", { exact: true }).fill("1");
  await page.getByLabel("Line 1 rate", { exact: true }).fill("150.00");
  await page.getByLabel("Line 1 sales account", { exact: true }).selectOption(f.incomeAccountId);
  await page.getByLabel("Default Tax:", { exact: true }).selectOption(f.taxCodeId);
  await page.getByLabel("Customer", { exact: true }).selectOption(f.customerId);
  await page.getByRole("button", { name: "Save Draft Invoice", exact: true }).click();
  await expect(page).toHaveURL(/\/sales\/invoices\/[a-f0-9-]{36}(?:\?.*)?$/);
  const batchDraftId = new URL(page.url()).pathname.split("/").pop()!;
  const batchDraftNum = query<{ invoice_number: string }>("SELECT invoice_number FROM sales_invoices WHERE id = ?", batchDraftId).invoice_number;

  await page.goto(`/b/${f.businessId}/sales/invoices`);
  const draftRow = page.locator("table.data-table tbody tr", { hasText: batchDraftNum });
  await expect(draftRow).toBeVisible();
  await draftRow.locator('input[type="checkbox"]').check();
  const batchBtn = page.getByRole("button", { name: /Submit for Approval \(1\)/i });
  await expect(batchBtn).toBeVisible();
  await batchBtn.click();
  await expect(page.getByText(/Submitted 1 draft invoice for approval\./i)).toBeVisible();
  await expect
    .poll(() => query<{ document_status: string }>("SELECT document_status FROM sales_invoices WHERE id = ?", batchDraftId).document_status)
    .toBe("pending_approval");

  // 8. Purchase invoice batch submit from list table when Maker requiresApproval=true shows "Submitted 1 draft bill for approval."
  await page.goto(`/b/${f.businessId}/purchases/invoices/new`);
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Supplier invoice #", { exact: true }).fill(`SUP-BATCH-${Date.now()}`);
  await page.getByLabel("Line 1 description", { exact: true }).fill("Batch Approval Bill Line");
  await page.getByLabel("Line 1 quantity", { exact: true }).fill("1");
  await page.getByLabel("Line 1 rate", { exact: true }).fill("180.00");
  await page.getByLabel("Line 1 expense account", { exact: true }).selectOption(f.expenseAccountId);
  await page.getByLabel("Default Tax:", { exact: true }).selectOption(f.taxCodeId);
  await page.getByLabel("Supplier", { exact: true }).selectOption(f.supplierId);
  await page.getByRole("button", { name: "Save Draft Bill", exact: true }).click();
  await expect(page).toHaveURL(/\/purchases\/invoices\/[a-f0-9-]{36}(?:\?.*)?$/);
  const batchBillId = new URL(page.url()).pathname.split("/").pop()!;
  const batchBillNum = query<{ internal_number: string }>("SELECT internal_number FROM purchase_invoices WHERE id = ?", batchBillId).internal_number;

  await page.goto(`/b/${f.businessId}/purchases/invoices`);
  const billRow = page.locator("table.data-table tbody tr", { hasText: batchBillNum });
  await expect(billRow).toBeVisible();
  await billRow.locator('input[type="checkbox"]').check();
  const batchBillBtn = page.getByRole("button", { name: /Submit for Approval \(1\)/i });
  await expect(batchBillBtn).toBeVisible();
  await batchBillBtn.click();
  await expect(page.getByText(/Submitted 1 draft bill for approval\./i)).toBeVisible();
  await expect
    .poll(() => query<{ document_status: string }>("SELECT document_status FROM purchase_invoices WHERE id = ?", batchBillId).document_status)
    .toBe("pending_approval");
});
