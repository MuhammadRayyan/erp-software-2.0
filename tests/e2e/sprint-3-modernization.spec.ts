import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { login } from "./helpers/session";
import { selectComboboxByIndex } from "./helpers/combobox";

type Fixture = {
  businessId: string;
  secondaryBusinessId: string;
};

function fixture(): Fixture {
  return JSON.parse(readFileSync(process.env.ERP_BROWSER_META!, "utf8"));
}

test.describe("Sprint 3 UI & Workflow Modernization", () => {
  test("Ctrl+K CommandPalette navigates, Sales Invoice uses Combobox + Z-pattern + non-duplicative sticky footer", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    const f = fixture();
    await login(page);
    await page.goto(`/b/${f.businessId}/overview`);
    await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();

    // 1. Open cmdk CommandPalette with Ctrl+K and jump to New Invoice
    await page.keyboard.press("Control+k");
    const cmdInput = page.locator("[cmdk-input]");
    await expect(cmdInput).toBeVisible();
    await cmdInput.fill("New Invoice");
    await page.locator("[cmdk-item]").filter({ hasText: "New Invoice" }).first().click();
    await expect(page).toHaveURL(new RegExp(`/b/${f.businessId}/sales/invoices/new$`));

    // 2. Combobox selections & isolated live totals calculation
    await selectComboboxByIndex(page, page.getByLabel("Customer", { exact: true }), 1);
    await expect(page.getByLabel("Customer", { exact: true })).not.toHaveAttribute("data-value", "");

    await page.getByLabel("Line 1 description", { exact: true }).fill("Sprint 3 Ergonomics Service");
    await page.getByLabel("Line 1 quantity", { exact: true }).fill("2");
    await page.getByLabel("Line 1 rate", { exact: true }).fill("100.00");
    await selectComboboxByIndex(page, page.getByLabel("Line 1 sales account", { exact: true }), 1);
    await selectComboboxByIndex(page, page.getByLabel("Default Tax:", { exact: true }), 1);

    // Sticky footer shows Total pill without redundant Subtotal/VAT breakdown inside the sticky footer
    const totalsSummary = page.locator("dl", { hasText: "Subtotal" });
    await expect(totalsSummary).toBeVisible();
    await expect(totalsSummary).toContainText("200.00");

    const stickyFooter = page.locator("div.sticky.bottom-0");
    await expect(stickyFooter).toBeVisible();
    await expect(stickyFooter).toContainText(/Total:/i);
    await expect(stickyFooter).not.toContainText(/Subtotal:/i);

    // Toggle "Amounts are tax inclusive" Radix Checkbox and verify it stays interactive
    const taxIncl = page.getByRole("checkbox", { name: "Amounts are tax inclusive" });
    await expect(taxIncl).toBeVisible();
    await taxIncl.click();
    await expect(taxIncl).toHaveAttribute("aria-checked", "true");
    await taxIncl.click();
    await expect(taxIncl).toHaveAttribute("aria-checked", "false");

    // 3. Combobox Tab inside line grid closes popover and advances focus to next column
    const lineAccountTrigger = page.getByLabel("Line 1 sales account", { exact: true });
    await lineAccountTrigger.click();
    await expect(page.locator("[cmdk-root]:visible")).toHaveCount(1);
    await page.keyboard.press("Tab");
    await expect(page.locator("[cmdk-root]:visible")).toHaveCount(0);
    await expect(page.getByLabel("Line 1 tax code", { exact: true })).toBeFocused();

    // 4. allowClear Combobox with active value skips its tabIndex=-1 Clear button on Tab
    const projectTrigger = page.getByLabel("Project", { exact: true });
    await selectComboboxByIndex(page, projectTrigger, 1);
    await expect(page.getByRole("button", { name: "No project", exact: true })).toBeVisible();
    await projectTrigger.click();
    await expect(page.locator("[cmdk-root]:visible")).toHaveCount(1);
    await page.keyboard.press("Tab");
    await expect(page.locator("[cmdk-root]:visible")).toHaveCount(0);
    await expect(page.locator("#reference")).toBeFocused();

    expect(errors).toEqual([]);
  });

  test("Quotes & Orders expose Save Draft and Save & Issue and support FIFO receipt settlement", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    const f = fixture();
    await login(page);

    // 1. Sales Quote Save Draft Quote + Save & Issue
    await page.goto(`/b/${f.businessId}/sales/quotes/new`);
    await expect(page.getByRole("button", { name: "Save Draft Quote", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Save & Issue", exact: true })).toBeVisible();

    await selectComboboxByIndex(page, page.getByLabel("Customer", { exact: true }), 1);
    await page.getByLabel("Line 1 description", { exact: true }).fill("Quote Line Sprint 3");
    await page.getByLabel("Line 1 quantity", { exact: true }).fill("1");
    await page.getByLabel("Line 1 rate", { exact: true }).fill("200.00");
    await selectComboboxByIndex(page, page.getByLabel("Line 1 sales account", { exact: true }), 1);
    await page.getByRole("button", { name: "Save & Issue", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/b/${f.businessId}/sales/quotes/[a-f0-9-]{36}(?:\\?.*)?$`));
    await expect(page.getByText(/Issued/i).first()).toBeVisible();

    // 2. Sales Order exposes Save Draft Order + Save & Issue
    await page.goto(`/b/${f.businessId}/sales/orders/new`);
    await expect(page.getByRole("button", { name: "Save Draft Order", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Save & Issue", exact: true })).toBeVisible();

    // 3. Create 2 posted invoices for Customer 1 and verify SettlementAllocationForm Auto-Allocate FIFO
    for (const [desc, rate, dueDate] of [
      ["FIFO Invoice Older Due", "100.00", "2026-01-10"],
      ["FIFO Invoice Later Due", "150.00", "2026-02-20"],
    ]) {
      await page.goto(`/b/${f.businessId}/sales/invoices/new`);
      await selectComboboxByIndex(page, page.getByLabel("Customer", { exact: true }), 1);
      await page.locator("#invoiceDate").fill("2026-01-01");
      await page.locator("#dueDate").fill(dueDate);
      await page.getByLabel("Line 1 description", { exact: true }).fill(desc);
      await page.getByLabel("Line 1 quantity", { exact: true }).fill("1");
      await page.getByLabel("Line 1 rate", { exact: true }).fill(rate);
      await selectComboboxByIndex(page, page.getByLabel("Line 1 sales account", { exact: true }), 1);
      await page.getByRole("button", { name: "Create & Post", exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/b/${f.businessId}/sales/invoices/[a-f0-9-]{36}(?:\\?.*)?$`));
    }

    await page.goto(`/b/${f.businessId}/sales/receipts/new`);
    await selectComboboxByIndex(page, page.getByLabel("Customer", { exact: true }), 1);
    await expect(page.getByRole("button", { name: /Auto-Allocate FIFO/i })).toBeVisible();
    await page.getByLabel(/^Amount Received/).fill("140.00");
    await page.getByRole("button", { name: /Auto-Allocate FIFO/i }).click();

    await expect(page.getByText("Allocated to Invoices")).toBeVisible();
    await expect(page.locator("text=140.00").first()).toBeVisible();

    // Verify purchase payment route uses unified Supplier settlement view cleanly
    await page.goto(`/b/${f.businessId}/purchases/payments/new`);
    await expect(page.getByRole("heading", { name: "Record Supplier Payment" })).toBeVisible();
    await expect(page.getByLabel("Supplier", { exact: true })).toHaveAttribute("role", "combobox");

    expect(errors).toEqual([]);
  });

  test("AppShell Active Business, persisted 64px Icon Rail & Collapsible Nav, Settings Hub & Customize, /admin tabs, and zero mobile overflow", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    const f = fixture();
    await login(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`/b/${f.businessId}/overview`);

    // 1. Desktop 64px collapsible rail + reload persistence
    const rail = page.locator("aside[data-sidebar-collapsed]").first();
    await expect(rail).toHaveAttribute("data-sidebar-collapsed", "false");
    await page.getByRole("button", { name: "Collapse sidebar", exact: true }).click();
    await expect(rail).toHaveAttribute("data-sidebar-collapsed", "true");
    await expect(async () => {
      const collapsedBox = await rail.boundingBox();
      expect(collapsedBox?.width).toBeLessThanOrEqual(70);
    }).toPass({ timeout: 5000 });

    await page.reload();
    await expect(rail).toHaveAttribute("data-sidebar-collapsed", "true");
    await page.getByRole("button", { name: "Expand sidebar", exact: true }).click();
    await expect(rail).toHaveAttribute("data-sidebar-collapsed", "false");

    // 2. Collapsible nav group persists across reload
    const bankingToggle = page.locator("aside nav button", { hasText: "Banking" }).first();
    await expect(bankingToggle).toHaveAttribute("aria-expanded", "true");
    await bankingToggle.click();
    await expect(bankingToggle).toHaveAttribute("aria-expanded", "false");
    await page.reload();
    await expect(page.locator("aside nav button", { hasText: "Banking" }).first()).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    await page.locator("aside nav button", { hasText: "Banking" }).first().click();

    // 3. Static active business label on top-left (no Switcher popover; switch lives in profile menu) & no Flow & Audit Guide
    await expect(rail.getByLabel(/Active business:/i)).toBeVisible();
    await expect(rail.getByRole("button", { name: "Switch business", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Audit Guide/i })).toHaveCount(0);

    // 4. Left sidebar footer shows only Settings (Customize and System Health live inside Settings even for Super Admin)
    await expect(rail.getByRole("link", { name: "Settings", exact: true })).toBeVisible();
    await expect(rail.getByRole("link", { name: "Customize", exact: true })).toHaveCount(0);
    await expect(rail.getByRole("link", { name: "System Health", exact: true })).toHaveCount(0);

    // Clean single-column Settings layout (left settings rail removed) + Customize/System Health tiles in Hub
    await rail.getByRole("link", { name: "Settings", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/b/${f.businessId}/settings$`));
    await expect(page.getByLabel("Settings navigation")).toHaveCount(0);
    await expect(page.getByRole("link", { name: /System Health & Diagnostics/i })).toBeVisible();
    await page.getByRole("link", { name: /My Profile & Security/i }).click();
    await expect(page).toHaveURL(new RegExp(`/b/${f.businessId}/settings/profile`));
    await expect(page.getByLabel("Settings navigation")).toHaveCount(0);
    await page.locator("main").getByRole("link", { name: "Settings", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/b/${f.businessId}/settings$`));

    // 4b. Customize navigation toggles via Settings Hub (hide EOSB Calculator, then hide HR group, then restore)
    await page.getByRole("link", { name: /Customize Modules/i }).click();
    await expect(page).toHaveURL(new RegExp(`/b/${f.businessId}/settings/customize`));
    await page.getByLabel("EOSB Calculator", { exact: true }).uncheck();
    await page.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(rail.getByRole("link", { name: "EOSB Calculator", exact: true })).toHaveCount(0);
    await expect(rail.getByRole("link", { name: "Employees", exact: true })).toBeVisible();

    await page.getByLabel("HR & Payroll", { exact: true }).uncheck();
    await page.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(rail.getByRole("link", { name: "Employees", exact: true })).toHaveCount(0);

    await page.getByRole("button", { name: "Show all", exact: true }).click();
    await page.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(rail.getByRole("link", { name: "EOSB Calculator", exact: true })).toBeVisible();

    // 5. Unified /admin sub-navigation
    await page.goto("/admin");
    const adminTabs = page.getByLabel("Admin Navigation Tabs");
    await expect(adminTabs).toBeVisible();
    await adminTabs.getByRole("link", { name: /All Workspaces/i }).click();
    await expect(page).toHaveURL(/\/admin\?tab=businesses/);
    await adminTabs.getByRole("link", { name: /Engine Health/i }).click();
    await expect(page).toHaveURL(/\/admin\/engine-health/);
    await expect(page.getByLabel("Admin Navigation Tabs")).toBeVisible();

    // 6. Mobile viewport top-header Search (no floating bottom-right FAB) & zero horizontal overflow
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/b/${f.businessId}/sales/invoices`);
    const mobileSearch = page.getByRole("button", { name: "Search or jump to (Ctrl K)" }).first();
    await expect(mobileSearch).toBeVisible();
    await expect(page.locator('button.fixed.bottom-5.right-5')).toHaveCount(0);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);

    expect(errors).toEqual([]);
  });

  test("Regression checks: CommandPalette ranking, GL drill-downs, Settings tab cleanup, Appearance viewer save, virtualized Combobox, line checkbox keyboard, and Template Studio CSP", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.addInitScript(() => {
      const win = window as typeof window & {
        __cspViolations?: Array<{ directive: string; blockedURI: string }>;
      };
      win.__cspViolations = [];
      window.addEventListener("securitypolicyviolation", (event) => {
        win.__cspViolations?.push({
          directive: event.violatedDirective,
          blockedURI: event.blockedURI,
        });
      });
    });

    const f = fixture();
    await login(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`/b/${f.businessId}/overview`);

    // 1. CommandPalette ranks exact/prefix navigation ("Reports", "Suppliers") above Create items and navigates on Enter
    await page.keyboard.press("Control+k");
    const cmdInput = page.locator("[cmdk-input]");
    await expect(cmdInput).toBeVisible();
    await cmdInput.fill("supplier");
    await expect(page.locator("[cmdk-item]").first()).toContainText("Suppliers");
    await cmdInput.fill("Reports");
    await expect(page.locator("[cmdk-item]").first()).toContainText("Reports");
    await cmdInput.press("Enter");
    await expect(page).toHaveURL(new RegExp(`/b/${f.businessId}/reports$`));
    await expect(page.getByRole("heading", { name: "Reports", exact: true })).toBeVisible();

    // 2. Trial Balance, P&L, and Balance Sheet account links point to /reports/general-ledger?accountId=... (no 404 chart-of-accounts links)
    for (const reportPath of ["trial-balance", "profit-loss", "balance-sheet"]) {
      await page.goto(`/b/${f.businessId}/reports/${reportPath}`);
      await expect(page.locator('a[href*="/accounting/chart-of-accounts/"]')).toHaveCount(0);
    }

    await page.goto(`/b/${f.businessId}/reports/trial-balance`);
    const glLink = page.locator(`a[href^="/b/${f.businessId}/reports/general-ledger?accountId="]`).first();
    await expect(glLink).toBeVisible();
    await glLink.click();
    await expect(page).toHaveURL(new RegExp(`/b/${f.businessId}/reports/general-ledger\\?accountId=`));
    await expect(page.getByRole("heading", { name: "General Ledger", exact: true })).toBeVisible();

    // 3. Settings Hub removes legacy tab UI (renders unified grid without tabs) and preserves ?q= search filtering
    await page.goto(`/b/${f.businessId}/settings?tab=security&q=appearance`);
    await expect(page.getByRole("tab")).toHaveCount(0);
    await expect(page.getByText(/Showing 1 setting matching .*appearance/i)).toBeVisible();
    await expect(
      page.locator("section", { hasText: "Business & Regional" }).getByRole("link", { name: /Appearance & Theme/i }),
    ).toBeVisible();

    // 4. Virtualized Combobox (>40 options) and DocumentLineTable checkbox onKeyDown on secondary business
    await page.goto(`/b/${f.secondaryBusinessId}/settings/custom-fields`);
    await page.getByRole("button", { name: /Line Item Fields/i }).click();
    await page.getByRole("button", { name: /New Custom Field/i }).first().click();
    await page.locator("#custom-field-entity").selectOption("sales_invoice_line");
    await page.locator("#custom-field-type").selectOption("checkbox");
    await page.locator("#custom-field-name").fill("Tax Exempt Line");
    await page.getByRole("button", { name: "Create field", exact: true }).click();
    await expect(page.getByText("Tax Exempt Line")).toBeVisible();

    await page.goto(`/b/${f.secondaryBusinessId}/sales/invoices/new`);
    const virtualAccountTrigger = page.getByLabel("Line 1 sales account", { exact: true });
    await virtualAccountTrigger.click();
    const virtualOptionCount = await page.locator("[cmdk-item][data-option-value]").count();
    expect(virtualOptionCount).toBeGreaterThan(0);
    expect(virtualOptionCount).toBeLessThan(40);
    const comboboxSearch = page.locator('[cmdk-input]:visible');
    await comboboxSearch.fill("no-such-account-zzz");
    await expect(page.getByText("No accounts found.", { exact: true })).toBeVisible();
    await comboboxSearch.fill("VAcct 40");
    await page.locator('[cmdk-item][data-option-value]', { hasText: "VAcct 40" }).first().click();
    await expect(virtualAccountTrigger).toContainText("VAcct 40");

    const lineCheckbox = page.getByRole("checkbox", { name: "Line 1 Tax Exempt Line", exact: true });
    await lineCheckbox.focus();
    await expect(lineCheckbox).toBeFocused();
    await page.keyboard.press("Space");
    await expect(lineCheckbox).toHaveAttribute("aria-checked", "true");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`/b/${f.secondaryBusinessId}/sales/invoices/new$`));
    await expect(lineCheckbox).toHaveAttribute("aria-checked", "true");
    await page.keyboard.press("Tab");
    await expect(lineCheckbox).not.toBeFocused();

    // 5. Read-only settings:view user can save personal Appearance Settings without permission="save" lock or Zod JIT errors
    await login(page, "settingsviewer");
    await page.goto(`/b/${f.businessId}/settings/appearance`);
    const saveAppearanceBtn = page.getByRole("button", { name: "Save Appearance Settings", exact: true });
    await expect(saveAppearanceBtn).toBeVisible();
    await expect(saveAppearanceBtn).toBeEnabled();
    await saveAppearanceBtn.click();
    await expect(page.getByText("Appearance settings updated successfully.")).toBeVisible();

    // 6. Template Studio blob: PDF <object> preview loads under production CSP (object-src 'self' blob:)
    await login(page, "admin");
    await page.goto(`/b/${f.businessId}/settings/document-templates`);
    await expect(page.locator('object[type="application/pdf"][data^="blob:"]')).toBeVisible({
      timeout: 20_000,
    });

    const cspViolations = await page.evaluate(
      () => (window as typeof window & { __cspViolations?: unknown[] }).__cspViolations ?? [],
    );
    expect(cspViolations).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("Standardized module list pages expose uniform search toolbar, density/column controls, and pagination footer", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    const f = fixture();
    await login(page);
    await page.setViewportSize({ width: 1280, height: 800 });

    const listPaths = [
      "customers",
      "sales/quotes",
      "sales/orders",
      "sales/invoices",
      "sales/receipts",
      "sales/credit-notes",
      "sales/delivery-notes",
      "suppliers",
      "purchases/quotes",
      "purchases/orders",
      "purchases/invoices",
      "purchases/payments",
      "purchases/debit-notes",
      "purchases/goods-receipts",
      "banking/accounts",
      "banking/pdcs",
      "payroll/employees",
      "payroll/payslips",
      "payroll/items",
    ];

    let populatedTablesVerified = 0;
    for (const rel of listPaths) {
      await page.goto(`/b/${f.businessId}/${rel}`);
      await expect(page.locator("h1.page-title")).toBeVisible();
      const rowCount = await page.locator("tbody tr").count();
      const hasToolbar = (await page.getByRole("button", { name: "Table density" }).count()) > 0;

      if (rowCount > 0 || hasToolbar) {
        await expect(page.getByRole("button", { name: "Table density" })).toBeVisible();
        await expect(page.getByRole("button", { name: /Columns/i }).first()).toBeVisible();
        if (rowCount > 0) {
          populatedTablesVerified += 1;
          const pager = page.getByRole("navigation", { name: "Pagination" });
          await expect(pager).toBeVisible();
          await expect(pager.getByLabel("Next page", { exact: true })).toBeVisible();
        }
      } else {
        await expect(page.getByText(/No .+ yet/i)).toBeVisible();
      }
    }
    expect(populatedTablesVerified).toBeGreaterThanOrEqual(10);

    expect(errors).toEqual([]);
  });
});
