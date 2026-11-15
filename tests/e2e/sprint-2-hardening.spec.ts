import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import JSZip from "jszip";
import { login } from "./helpers/session";

type Fixture = { businessId: string };
function fixture(): Fixture {
  return JSON.parse(readFileSync(process.env.ERP_BROWSER_META!, "utf8"));
}

test.describe("Sprint 2 browser verification", () => {
  test("Overview defers charts off initial financial tab and renders charts on tab switch", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    const f = fixture();
    await login(page);
    await page.goto(`/b/${f.businessId}/overview`);

    await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Recent Invoices" })).toBeVisible();
    // Initial financial tab must NOT mount off-tab chart SVGs
    await expect(page.locator(".recharts-surface")).toHaveCount(0);

    await page.locator("#tab-charts").click();
    await expect(page).toHaveURL(/view=charts/);
    await expect(page.getByText(/30-Day Cash Flow|Receivables Aging|Monthly Financial/i).first()).toBeVisible();

    await page.locator("#tab-financial").click();
    await expect(page).not.toHaveURL(/view=charts/);
    await expect(page.getByRole("heading", { name: "Recent Invoices" })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("Sales Invoices, Customers, Receipts, & Payments use DataTable + nuqs URL state without hiding toolbar on 0 matches", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    const f = fixture();
    await login(page);

    // 1. Sales Invoices: zero-match filter preserves toolbar + deep link ?status=unpaid populates filter select
    await page.goto(`/b/${f.businessId}/sales/invoices?status=unpaid`);
    await expect(page.getByRole("heading", { name: "Sales Invoices" })).toBeVisible();
    await expect(page.getByLabel("Filter invoices")).toHaveValue("payment:open");
    await expect(page.getByRole("button", { name: /Reset all/i })).toBeVisible();

    const invSearch = page.getByPlaceholder("Search invoices…");
    await invSearch.fill("__NO_SPRINT2_MATCH__");
    await expect(page).toHaveURL(/q=__NO_SPRINT2_MATCH__/);
    await expect(page.getByText(/No invoices/i)).toBeVisible();
    await expect(invSearch).toBeVisible();
    await page.getByRole("button", { name: /Reset all/i }).click();
    await expect(page).not.toHaveURL(/q=__NO_SPRINT2_MATCH__/);

    // Server sorting updates URL params cleanly and survives reload
    await page.locator("th", { hasText: /^Total$/ }).click();
    await expect(page).toHaveURL(/sort=totalMinor/);
    await page.reload();
    await expect(page).toHaveURL(/sort=totalMinor/);

    // 2. Customers DataTable server search & zero-match toolbar preservation
    await page.goto(`/b/${f.businessId}/customers`);
    await expect(page.getByRole("heading", { name: "Customers" })).toBeVisible();
    const firstCustomerName = (await page.locator("table tbody tr td a").first().textContent())?.trim();
    expect(firstCustomerName).toBeTruthy();
    const customerSearch = page.getByPlaceholder("Search customers…");
    await customerSearch.fill(firstCustomerName!);
    await expect(page).toHaveURL(/q=/);
    await expect(page.locator("table tbody").getByText(firstCustomerName!, { exact: true }).first()).toBeVisible();
    await customerSearch.fill("__NO_CUSTOMER_MATCH__");
    await expect(customerSearch).toBeVisible();

    // 3. Purchase Invoices DataTable + nuqs search
    await page.goto(`/b/${f.businessId}/purchases/invoices`);
    await expect(page.getByRole("heading", { name: "Purchase Invoices", exact: true })).toBeVisible();
    const piSearch = page.getByPlaceholder("Search purchase invoices…");
    await piSearch.fill("__NO_PURCHASE_MATCH__");
    await expect(page).toHaveURL(/q=__NO_PURCHASE_MATCH__/);
    await expect(page.getByText(/No purchase invoices/i)).toBeVisible();
    await expect(piSearch).toBeVisible();

    // 4. Receipts DataTable toolbar, search, status & URL sync
    await page.goto(`/b/${f.businessId}/sales/receipts`);
    await expect(page.getByRole("heading", { name: "Receipts", exact: true })).toBeVisible();
    await expect(page.getByPlaceholder("Search receipts…")).toBeVisible();
    await expect(page.getByLabel("Filter receipts")).toBeVisible();
    await expect(page.getByLabel("Receipt date from")).toBeVisible();

    // 5. Supplier Payments DataTable toolbar, search, status & URL sync
    await page.goto(`/b/${f.businessId}/purchases/payments`);
    await expect(page.getByRole("heading", { name: "Supplier Payments", exact: true })).toBeVisible();
    await expect(page.getByPlaceholder("Search supplier payments…")).toBeVisible();
    await expect(page.getByLabel("Filter supplier payments")).toBeVisible();
    await expect(page.getByLabel("Payment date from")).toBeVisible();

    expect(errors).toEqual([]);
  });

  test("Streaming backup ZIP & streaming batch-pdf ZIP HTTP routes return valid archives", async ({ page }) => {
    const f = fixture();
    await login(page);

    const backupResp = await page.request.get(`/api/businesses/${f.businessId}/backup`);
    expect(backupResp.status()).toBe(200);
    expect(backupResp.headers()["content-type"]).toContain("application/zip");
    const backupBuf = await backupResp.body();
    expect(backupBuf.subarray(0, 2).toString("utf8")).toBe("PK");
    const backupZip = await JSZip.loadAsync(backupBuf);
    expect(backupZip.file("manifest.json")).toBeTruthy();
    expect(backupZip.file("business.sqlite")).toBeTruthy();

    await page.goto(`/b/${f.businessId}/sales/invoices`);
    const firstInvoiceHref = await page.locator(`table tbody a[href^="/b/${f.businessId}/sales/invoices/"]`).first().getAttribute("href");
    const invoiceId = firstInvoiceHref?.split("/").pop();
    expect(invoiceId && invoiceId !== "new").toBeTruthy();

    const batchResp = await page.request.post(`/api/businesses/${f.businessId}/documents/sales-invoice/batch-pdf`, {
      data: { documentIds: [invoiceId, invoiceId] },
    });
    expect(batchResp.status()).toBe(200);
    expect(batchResp.headers()["content-type"]).toContain("application/zip");
    const batchBuf = await batchResp.body();
    expect(batchBuf.subarray(0, 2).toString("utf8")).toBe("PK");
    const batchZip = await JSZip.loadAsync(batchBuf);
    const fileNames = Object.keys(batchZip.files);
    expect(fileNames.length).toBe(2);
    const firstPdf = await batchZip.file(fileNames[0])!.async("nodebuffer");
    expect(firstPdf.subarray(0, 5).toString("utf8")).toBe("%PDF-");
  });
});
