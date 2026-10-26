import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

function businessId() { return (JSON.parse(readFileSync(process.env.ERP_BROWSER_META!, "utf8")) as { businessId: string }).businessId; }
async function login(page: Page, role: "admin" | "warehouse" | "salesviewer" | "creator") {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill(role === "admin" ? "admin@demo.local" : `${role}@hardening.invalid`);
  await page.locator('input[name="password"]').fill(role === "admin" ? "demo12345" : "SyntheticPass123!");
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await expect(page.getByRole("heading", { name: "My Businesses" })).toBeVisible();
}

test("warehouse users see a useful permission state and no financial data", async ({ page }) => {
  await login(page, "warehouse");
  await page.goto(`/b/${businessId()}/overview`);
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Module access required" })).toBeVisible();
  await expect(page.getByText("Posted Sales", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Bank & Cash", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Recent Invoices" })).toHaveCount(0);
});

test("view-only sales users cannot open create forms or export invoices", async ({ page }) => {
  await login(page, "salesviewer");
  await page.goto(`/b/${businessId()}/sales/invoices/new`);
  await expect(page.getByRole("heading", { name: "Action permission required" })).toBeVisible();
  await expect(page.getByRole("button", { name: /save|post/i })).toHaveCount(0);
  const response = await page.request.get(`/api/businesses/${businessId()}/documents/sales-invoice/not-a-document/pdf`);
  expect(response.status()).toBe(403);
});

test("create-only sales users can save a draft but are not offered posting", async ({ page }) => {
  await login(page, "creator");
  await page.goto(`/b/${businessId()}/sales/invoices/new`);
  await expect(page.getByRole("button", { name: /save.*draft/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /save.*post|post invoice/i })).toHaveCount(0);
});

test("administrator payroll uses the shared footer and preserves input after validation", async ({ page }) => {
  await login(page, "admin");
  await page.goto(`/b/${businessId()}/payroll/payslips/new`);
  await expect(page.getByRole("heading", { name: "New Payslip", exact: true })).toBeVisible();
  await page.getByLabel("Period Description").fill("Synthetic monthly payroll");
  await page.getByRole("button", { name: "Save as Draft", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Please select an employee" })).toBeVisible();
  await expect(page.getByLabel("Period Description")).toHaveValue("Synthetic monthly payroll");
  await expect(page.getByRole("button", { name: "Save & Post to Ledger", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel", exact: true })).toBeVisible();
});

test("mobile restricted overview stays within the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, "warehouse");
  await page.goto(`/b/${businessId()}/overview`);
  await expect(page.getByRole("heading", { name: "Module access required" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});
