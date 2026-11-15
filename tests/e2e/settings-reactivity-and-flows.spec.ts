import { test, expect } from '@playwright/test';

test.describe('Settings Reactivity, PDF Generations, and System Health Flows', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator('article a').first().click();
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  });

  test('1. Settings Reactivity: Numbering, Business Profile, UOM, and Payment Terms', async ({ page }) => {
    test.setTimeout(90000);
    const businessId = page.url().match(/\/b\/([^/]+)/)?.[1] || 'demo';

    // ── A. Document Numbering Reactivity ───────────────────────────────────
    await page.goto(`/b/${businessId}/settings/numbering`);
    await expect(page.getByRole('heading', { name: 'Numbering' })).toBeVisible();
    
    // Fill custom invoice prefix and padding
    await page.locator('#prefix').fill('AUTOINV-');
    await page.locator('#padding').fill('5');
    await page.getByRole('button', { name: /save all numbering sequences/i }).click();
    await expect(page.getByText(/document numbering updated/i).first()).toBeVisible({ timeout: 10000 });

    // ── B. Business Profile & Branding Reactivity ───────────────────────────
    await page.goto(`/b/${businessId}/settings/business-profile`);
    await expect(page.getByRole('heading', { name: 'Business Profile & Branding' })).toBeVisible();

    const uniqueLegalName = `Enterprise Horizons LLC ${Date.now()}`;
    await page.locator('#legalName').fill(uniqueLegalName);
    await page.locator('#taxId').fill('100999888777003');
    await page.getByRole('button', { name: /save business profile/i }).click();
    await expect(page.getByText(/business profile and organization branding updated/i).first()).toBeVisible({ timeout: 10000 });

    // ── C. Payment Terms Presets CRUD ───────────────────────────────────────
    await page.goto(`/b/${businessId}/settings/payment-terms`);
    await expect(page.getByRole('heading', { name: 'Payment Terms', exact: true })).toBeVisible();

    const termName = `E2E Net 75 Days ${Date.now()}`;
    await page.locator('#termName').fill(termName);
    await page.locator('#daysCount').fill('75');
    await page.getByRole('button', { name: /add term/i }).click();
    await expect(page.getByText(termName).first()).toBeVisible({ timeout: 10000 });

    // ── D. Units of Measure Catalog CRUD ───────────────────────────────────
    await page.goto(`/b/${businessId}/settings/units-of-measure`);
    await expect(page.getByRole('heading', { name: 'Units of Measure', exact: true })).toBeVisible();

    const uomCode = `bx${Date.now().toString().slice(-4)}`;
    await page.locator('#uom-code').fill(uomCode);
    await page.locator('#uom-name').fill('Master Carton of 50');
    await page.getByRole('button', { name: /add unit/i }).click();
    await expect(page.getByText(uomCode).first()).toBeVisible({ timeout: 10000 });
  });

  test('2. System Health Dashboard, Live Metrics & Diagnostic Trace Trigger', async ({ page }) => {
    test.setTimeout(60000);
    const businessId = page.url().match(/\/b\/([^/]+)/)?.[1] || 'demo';

    await page.goto(`/b/${businessId}/settings/system-health`);
    await expect(page.getByRole('heading', { name: 'System Health & Diagnostics' })).toBeVisible();

    // Verify key telemetry elements are rendered
    await expect(page.getByText(/Business DB \(SQLite\)/i).first()).toBeVisible();
    await expect(page.getByText(/System DB & Logs/i).first()).toBeVisible();
    await expect(page.getByText(/Hardened Pragmas/i).first()).toBeVisible();
    await expect(page.getByText(/Heap Memory/i).first()).toBeVisible();

    // Click "Trigger Sample Sentry Trace"
    const triggerBtn = page.getByRole('button', { name: /trigger sample sentry trace/i });
    await expect(triggerBtn).toBeVisible();
    await triggerBtn.click();

    // Verify confirmation toast
    await expect(page.getByText(/Sample Sentry trace & error logged successfully/i).first()).toBeVisible({ timeout: 10000 });

    // Verify trace is visible in recent traces table
    await expect(page.getByText(/Diagnostic test error triggered by admin/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('3. Document Templates Studio & PDF Route Generation', async ({ page, request }) => {
    test.setTimeout(90000);
    const businessId = page.url().match(/\/b\/([^/]+)/)?.[1] || 'demo';

    // Verify templates studio UI
    await page.goto(`/b/${businessId}/settings/document-templates`);
    await expect(page.getByRole('heading', { name: 'Document Templates' })).toBeVisible();

    // Verify template layout radio buttons
    await expect(page.getByText(/Classic/i).first()).toBeVisible();
    await expect(page.getByText(/Minimal/i).first()).toBeVisible();
    await expect(page.getByText(/Modern/i).first()).toBeVisible();

    // Check preview PDF endpoint directly
    const previewRes = await request.post(`/api/businesses/${businessId}/document-templates/preview-pdf`, {
      data: {
        documentType: 'sales-invoice',
        variant: 'modern',
        settings: {
          templateLayout: 'modern',
          primaryColor: '#2563eb',
          fontSize: 'normal',
          showSignatureBlock: true,
          signatureLabel: 'Authorized Signatory',
        },
      },
    });

    expect(previewRes.status()).toBe(200);
    expect(previewRes.headers()['content-type']).toContain('application/pdf');
    const pdfBytes = await previewRes.body();
    expect(pdfBytes.length).toBeGreaterThan(2000);
    expect(pdfBytes.subarray(0, 4).toString()).toBe('%PDF');
  });
});
