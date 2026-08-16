# Sprint 2 — PDF Engine Migration

**Goal:** Replace pdfme (4 pinned packages) with `@react-pdf/renderer` (React-component defaults) + Handlebars/Puppeteer (custom HTML templates). Build a settings page with live preview.
**Effort:** ~5 days
**Dependencies:** Sprint 0 complete (Sprint 1 recommended but not strictly required)
**Prerequisite reading:** `implementation/00-overview.md`

---

## Overview

The current PDF system uses pdfme 5.5.10 (pinned because 6.x pulls `clawpdf` into the browser). It's fragile, table handling is clunky (line items embedded as JSON strings), and the visual designer doesn't match the final output.

**New architecture:**
- **Default templates:** React components rendered via `@react-pdf/renderer` server-side. Driven by a settings page (logo, colors, fonts, field toggles).
- **Custom HTML templates:** Power users write Handlebars + HTML/CSS, rendered via Puppeteer. The Manager.io "custom theme" model.
- **Template registry:** Picks React or HTML path per business config.

---

## Day 1: Install deps + build invoice React template

### 1.1 Install dependencies

```bash
npm install @react-pdf/renderer handlebars puppeteer
npm install -d @types/handlebars
```

**Note:** `puppeteer` downloads Chromium (~200 MB) on first install. This is expected. If you want to use a system Chromium instead, install `puppeteer-core` and configure `executablePath`.

### 1.2 Create the folder structure

```bash
mkdir -p src/modules/document-templates/react-pdf
mkdir -p src/modules/document-templates/html-templates/defaults
```

### 1.3 Build the invoice React template

Create `src/modules/document-templates/react-pdf/primitives.tsx`:

```tsx
import { Text, View, StyleSheet } from "@react-pdf/renderer";

// Shared styles for all templates
export const colors = {
  text: "#202936",
  muted: "#657184",
  border: "#dce2e9",
  borderStrong: "#cbd4df",
  surface: "#f8fafc",
  surfaceMuted: "#edf1f5",
};

export const sharedStyles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 10,
    fontFamily: "Inter",
    color: colors.text,
    lineHeight: 1.4,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: 8,
    color: colors.muted,
    fontWeight: 600,
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  table: {
    display: "flex",
    width: "100%",
    marginVertical: 10,
  },
  tableHeaderRow: {
    flexDirection: "row",
    backgroundColor: colors.surfaceMuted,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderStrong,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
    minHeight: 24,
  },
  tableCell: {
    padding: 6,
    fontSize: 9,
  },
  totals: {
    marginTop: 20,
    alignItems: "flex-end",
  },
  totalsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: 200,
    marginBottom: 4,
  },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 40,
    right: 40,
    fontSize: 8,
    color: colors.muted,
    textAlign: "center",
    borderTopWidth: 0.5,
    borderTopColor: colors.border,
    paddingTop: 8,
  },
});
```

Create `src/modules/document-templates/react-pdf/invoice-template.tsx`:

```tsx
import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";
import { sharedStyles, colors } from "./primitives";

export type InvoiceTemplateData = {
  companyName: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  customerName: string;
  customerAddress?: string;
  customerTrn?: string;
  lines: Array<{
    description: string;
    quantity: string;
    unitPrice: string;
    amount: string;
  }>;
  subtotal: string;
  tax: string;
  total: string;
  foreignDetail?: string;
};

export type TemplateSettings = {
  logoUrl?: string;
  primaryColor: string;
  fontName: "Inter" | "Roboto" | "Open Sans" | "Lato";
  headerText?: string;
  footerText?: string;
  showProjectColumn: boolean;
  showTaxColumn: boolean;
  showCustomerTrn: boolean;
  showPaymentTerms: boolean;
};

const styles = StyleSheet.create({
  ...sharedStyles,
  logo: { width: 120, height: 40, objectFit: "contain" },
  invoiceTitle: { fontSize: 24, fontWeight: "bold" },
  customerName: { fontSize: 12, fontWeight: 600 },
});

export function InvoiceDocument({ data, settings }: { data: InvoiceTemplateData; settings: TemplateSettings }) {
  const primaryColor = settings.primaryColor || colors.text;

  return (
    <Document>
      <Page size="A4" style={[styles.page, { fontFamily: settings.fontName }]}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            {settings.logoUrl && <Image src={settings.logoUrl} style={styles.logo} />}
            <Text style={{ marginTop: 8, color: primaryColor, fontWeight: 600 }}>{data.companyName}</Text>
            {settings.headerText && <Text style={{ fontSize: 8, color: colors.muted }}>{settings.headerText}</Text>}
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={[styles.invoiceTitle, { color: primaryColor }]}>INVOICE</Text>
            <Text style={{ marginTop: 4 }}>{data.invoiceNumber}</Text>
            <Text style={{ fontSize: 9, color: colors.muted }}>{data.invoiceDate}</Text>
            <Text style={{ fontSize: 9, color: colors.muted }}>{data.dueDate}</Text>
          </View>
        </View>

        {/* Bill To */}
        <View style={{ marginBottom: 20 }}>
          <Text style={styles.sectionTitle}>Bill To</Text>
          <Text style={styles.customerName}>{data.customerName}</Text>
          {data.customerAddress && <Text style={{ fontSize: 9, color: colors.muted }}>{data.customerAddress}</Text>}
          {settings.showCustomerTrn && data.customerTrn && (
            <Text style={{ fontSize: 9, color: colors.muted }}>TRN: {data.customerTrn}</Text>
          )}
        </View>

        {/* Line items */}
        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.tableCell, { flex: 3, fontWeight: 600 }]}>Description</Text>
            <Text style={[styles.tableCell, { flex: 1, textAlign: "right", fontWeight: 600 }]}>Qty</Text>
            <Text style={[styles.tableCell, { flex: 1, textAlign: "right", fontWeight: 600 }]}>Rate</Text>
            <Text style={[styles.tableCell, { flex: 1, textAlign: "right", fontWeight: 600 }]}>Amount</Text>
          </View>
          {data.lines.map((line, i) => (
            <View key={i} style={styles.tableRow} wrap={false}>
              <Text style={[styles.tableCell, { flex: 3 }]}>{line.description}</Text>
              <Text style={[styles.tableCell, { flex: 1, textAlign: "right" }]}>{line.quantity}</Text>
              <Text style={[styles.tableCell, { flex: 1, textAlign: "right" }]}>{line.unitPrice}</Text>
              <Text style={[styles.tableCell, { flex: 1, textAlign: "right" }]}>{line.amount}</Text>
            </View>
          ))}
        </View>

        {/* Totals */}
        <View style={styles.totals}>
          <View style={styles.totalsRow}>
            <Text style={{ color: colors.muted }}>Subtotal</Text>
            <Text>{data.subtotal}</Text>
          </View>
          {settings.showTaxColumn && (
            <View style={styles.totalsRow}>
              <Text style={{ color: colors.muted }}>VAT</Text>
              <Text>{data.tax}</Text>
            </View>
          )}
          <View style={[styles.totalsRow, { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 4, marginTop: 4 }]}>
            <Text style={{ fontWeight: "bold", fontSize: 12 }}>Total</Text>
            <Text style={{ fontWeight: "bold", fontSize: 12 }}>{data.total}</Text>
          </View>
          {data.foreignDetail && (
            <Text style={{ fontSize: 8, color: colors.muted, marginTop: 8, textAlign: "right" }}>
              {data.foreignDetail}
            </Text>
          )}
        </View>

        {/* Footer */}
        {settings.footerText && (
          <Text style={styles.footer}>{settings.footerText}</Text>
        )}
      </Page>
    </Document>
  );
}
```

### 1.4 Create the render wrapper

Create `src/modules/document-templates/react-pdf/render.ts`:

```ts
import { renderToBuffer } from "@react-pdf/renderer";
import type { ReactElement } from "react";

export async function renderReactPdf(element: ReactElement): Promise<Buffer> {
  return renderToBuffer(element);
}
```

### 1.5 Verify compilation

```bash
npm run typecheck
npm run lint
```

### 1.6 Commit
```bash
git add -A && git commit -m "sprint-2: install deps + invoice React template + render wrapper"
```

---

## Day 2: Settings schema + settings page + live preview

### 2.1 Create the settings schema

Create `src/modules/document-templates/template-settings.ts`:

```ts
import { z } from "zod";

export const templateSettingsSchema = z.object({
  templateType: z.enum(["modern", "classic", "custom-html"]).default("modern"),
  logoUrl: z.string().url().nullable().optional(),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#356fd0"),
  fontName: z.enum(["Inter", "Roboto", "Open Sans", "Lato"]).default("Inter"),
  headerText: z.string().max(200).optional().default(""),
  footerText: z.string().max(200).optional().default("Thank you for your business"),
  showProjectColumn: z.boolean().default(false),
  showTaxColumn: z.boolean().default(true),
  showCustomerTrn: z.boolean().default(false),
  showPaymentTerms: z.boolean().default(false),
  customHtml: z.string().max(50000).optional().default(""),
});

export type TemplateSettings = z.infer<typeof templateSettingsSchema>;

export const defaultSettings: TemplateSettings = {
  templateType: "modern",
  logoUrl: null,
  primaryColor: "#356fd0",
  fontName: "Inter",
  headerText: "",
  footerText: "Thank you for your business",
  showProjectColumn: false,
  showTaxColumn: true,
  showCustomerTrn: false,
  showPaymentTerms: false,
  customHtml: "",
};
```

### 2.2 Update the document_templates table schema

**Note:** This requires a migration. Add migration version 10 to `src/core/db/business-migrations.ts`:

```ts
// Version 10: Document template settings
{
  version: 10,
  name: "document_template_settings",
  up: (sqlite) => {
    sqlite.exec(`
      ALTER TABLE document_templates ADD COLUMN settings_json TEXT;
      ALTER TABLE document_templates ADD COLUMN custom_html TEXT;
      -- Backfill existing pdfme templates as 'modern' defaults
      UPDATE document_templates
      SET settings_json = '{"templateType":"modern","primaryColor":"#356fd0","fontName":"Inter","footerText":"Thank you for your business","showTaxColumn":true}'
      WHERE settings_json IS NULL;
    `);
  },
},
```

Run the migration:
```bash
npm run db:migrate
```

### 2.3 Update template-service.ts

Open `src/modules/document-templates/template-service.ts`. Replace with:

```ts
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getBusinessDb } from "@/core/db/business";
import { documentTemplates } from "@/core/db/business-schema";
import { defaultSettings, templateSettingsSchema, type TemplateSettings } from "./template-settings";

export function getTemplateSettings(businessId: string, userId: string, documentType: string = "sales-invoice"): TemplateSettings {
  const row = getBusinessDb(businessId, userId).db
    .select()
    .from(documentTemplates)
    .where(eq(documentTemplates.documentType, documentType))
    .get();

  if (!row || !row.settingsJson) return defaultSettings;

  try {
    return templateSettingsSchema.parse(JSON.parse(row.settingsJson));
  } catch {
    return defaultSettings;
  }
}

export function saveTemplateSettings(businessId: string, userId: string, documentType: string, settings: unknown) {
  const parsed = templateSettingsSchema.parse(settings);
  const context = getBusinessDb(businessId, userId);
  const current = context.db.select().from(documentTemplates).where(eq(documentTemplates.documentType, documentType)).get();
  const now = new Date().toISOString();

  if (current) {
    context.db.update(documentTemplates)
      .set({ settingsJson: JSON.stringify(parsed), customHtml: parsed.customHtml, updatedAt: now })
      .where(eq(documentTemplates.id, current.id))
      .run();
  } else {
    context.db.insert(documentTemplates)
      .values({
        id: randomUUID(),
        documentType,
        name: documentType,
        templateJson: JSON.stringify(parsed),  // keep for backward compat
        settingsJson: JSON.stringify(parsed),
        customHtml: parsed.customHtml,
        updatedAt: now,
      })
      .run();
  }
}
```

**Note:** You need to add `settingsJson` and `customHtml` columns to the Drizzle schema in `src/core/db/business-schema.ts`:

```ts
export const documentTemplates = sqliteTable("document_templates", {
  id: text("id").primaryKey(),
  documentType: text("document_type").notNull(),
  name: text("name").notNull(),
  templateJson: text("template_json").notNull(),
  settingsJson: text("settings_json"),
  customHtml: text("custom_html"),
  updatedAt: text("updated_at").notNull(),
});
```

### 2.4 Create the template registry

Create `src/modules/document-templates/template-registry.ts`:

```ts
import { renderReactPdf } from "./react-pdf/render";
import { InvoiceDocument, type InvoiceTemplateData } from "./react-pdf/invoice-template";
import { renderHtmlTemplate } from "./html-templates/render";
import { getTemplateSettings, type TemplateSettings } from "./template-settings";

export async function renderInvoicePdf(
  businessId: string,
  userId: string,
  data: InvoiceTemplateData,
): Promise<Buffer> {
  const settings = getTemplateSettings(businessId, userId, "sales-invoice");

  if (settings.templateType === "custom-html" && settings.customHtml) {
    return renderHtmlTemplate(settings.customHtml, data, settings);
  }

  return renderReactPdf(<InvoiceDocument data={data} settings={settings} />);
}
```

**Note:** The `renderHtmlTemplate` function is created on Day 3. For now, create a stub:

```ts
// src/modules/document-templates/html-templates/render.ts (stub for Day 2)
export async function renderHtmlTemplate(html: string, data: unknown, settings: unknown): Promise<Buffer> {
  throw new Error("HTML templates not yet implemented (Day 3)");
}
```

### 2.5 Update the PDF API route

Open `src/app/api/businesses/[businessId]/invoices/[invoiceId]/pdf/route.ts`. Update to use the new registry:

```ts
import { NextResponse } from "next/server";
import { getCurrentSession } from "@/core/auth/session";
import { formatDate, formatMoney } from "@/core/format";
import { getDocumentPdfAccess } from "@/core/permissions/document-pdf-access";
import { quantityMicrosToInput } from "@/modules/accounting/calculations/money";
import { renderInvoicePdf } from "@/modules/document-templates/template-registry";
import { getInvoice } from "@/modules/sales-invoices/invoice-service";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ businessId: string; invoiceId: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { businessId, invoiceId } = await params;
  const access = getDocumentPdfAccess(businessId, session.user.id, "sales-invoice");
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const record = getInvoice(businessId, session.user.id, invoiceId);
  if (!record) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

  const { invoice, customer, lines } = record;
  const currency = invoice.currencyCode;
  const foreignDetail = currency === access.business.currency
    ? ""
    : `Rate 1 ${currency} = ${invoice.exchangeRateToBase} ${access.business.currency} (${invoice.exchangeRateSource}, ${invoice.exchangeRateDate}) · Base ${formatMoney(invoice.baseTotalMinor, access.business.currency)}`;

  const data = {
    companyName: access.business.name,
    invoiceNumber: invoice.invoiceNumber,
    invoiceDate: `Invoice date: ${formatDate(invoice.invoiceDate)}`,
    dueDate: `Due date: ${formatDate(invoice.dueDate)}`,
    customerName: customer.name,
    customerTrn: customer.taxReference || undefined,
    lines: lines.map((line) => ({
      description: line.description,
      quantity: quantityMicrosToInput(line.quantityMicros),
      unitPrice: formatMoney(line.unitPriceMinor, currency),
      amount: formatMoney(line.grossAmountMinor, currency),
    })),
    subtotal: formatMoney(invoice.subtotalMinor, currency),
    tax: formatMoney(invoice.taxMinor, currency),
    total: formatMoney(invoice.totalMinor, currency),
    foreignDetail: foreignDetail || undefined,
  };

  try {
    const pdf = await renderInvoicePdf(businessId, session.user.id, data);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${invoice.invoiceNumber}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "PDF generation failed" },
      { status: 500 }
    );
  }
}
```

### 2.6 Build the settings page

Open `src/app/b/[businessId]/settings/document-templates/page.tsx`. Replace with:

```tsx
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireModule } from "@/core/permissions/require-module";
import { getTemplateSettings } from "@/modules/document-templates/template-settings";
import { TemplateEditor } from "@/modules/document-templates/template-editor";

export default async function DocumentTemplatesPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const { user, access } = await requireModule(businessId, "settings");
  if (access.membership.role !== "administrator") {
    return <div className="page-container">Administrator access is required.</div>;
  }
  const settings = getTemplateSettings(businessId, user.id, "sales-invoice");
  return (
    <div className="page-container max-w-[1500px]">
      <Link href={`/b/${businessId}/settings`} className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Settings
      </Link>
      <div className="page-header">
        <div>
          <h1 className="page-title">Invoice Template</h1>
          <p className="page-description">Customize the appearance of your sales invoice PDFs.</p>
        </div>
      </div>
      <TemplateEditor businessId={businessId} initialSettings={settings} />
    </div>
  );
}
```

### 2.7 Build the template editor component

Create `src/modules/document-templates/template-editor.tsx`:

```tsx
"use client";

import { useState } from "react";
import { LoaderCircle, Eye } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveTemplateSettingsAction } from "./actions";
import type { TemplateSettings } from "./template-settings";

const selectClass = "h-9 w-full rounded-[6px] border border-border-strong bg-surface-raised px-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring/25";

export function TemplateEditor({ businessId, initialSettings }: { businessId: string; initialSettings: TemplateSettings }) {
  const [settings, setSettings] = useState<TemplateSettings>(initialSettings);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  function update<K extends keyof TemplateSettings>(key: K, value: TemplateSettings[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    setSaving(true);
    const result = await saveTemplateSettingsAction(businessId, "sales-invoice", settings);
    setSaving(false);
    if (result.error) toast.error(result.error);
    else toast.success("Template settings saved");
  }

  async function preview() {
    setPreviewing(true);
    try {
      // Save first, then open PDF in new tab
      await saveTemplateSettingsAction(businessId, "sales-invoice", settings);
      // Use the first invoice or a sample
      const url = `/api/businesses/${businessId}/invoices/preview-pdf?_t=${Date.now()}`;
      window.open(url, "_blank");
    } catch (error) {
      toast.error("Preview failed");
    }
    setPreviewing(false);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
      <div className="space-y-6">
        {/* Template type */}
        <section className="rounded-lg border border-border bg-surface-raised p-5">
          <h2 className="text-base font-semibold">Template type</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {(["modern", "classic", "custom-html"] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => update("templateType", type)}
                className={`rounded-md border p-4 text-left text-sm transition-colors ${
                  settings.templateType === type
                    ? "border-primary bg-accent"
                    : "border-border bg-surface hover:border-border-strong"
                }`}
              >
                <span className="block font-medium capitalize">{type === "custom-html" ? "Custom HTML" : type}</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {type === "modern" && "Clean, modern layout with your branding"}
                  {type === "classic" && "Traditional accounting document style"}
                  {type === "custom-html" && "Write your own HTML/CSS template"}
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* Branding (for modern/classic) */}
        {settings.templateType !== "custom-html" && (
          <section className="rounded-lg border border-border bg-surface-raised p-5">
            <h2 className="text-base font-semibold">Branding</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="primaryColor">Primary color</Label>
                <div className="flex gap-2">
                  <input
                    id="primaryColor"
                    type="color"
                    value={settings.primaryColor}
                    onChange={(e) => update("primaryColor", e.target.value)}
                    className="h-9 w-12 rounded border border-border-strong"
                  />
                  <Input
                    value={settings.primaryColor}
                    onChange={(e) => update("primaryColor", e.target.value)}
                    className="flex-1"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fontName">Font</Label>
                <select
                  id="fontName"
                  className={selectClass}
                  value={settings.fontName}
                  onChange={(e) => update("fontName", e.target.value as TemplateSettings["fontName"])}
                >
                  <option value="Inter">Inter</option>
                  <option value="Roboto">Roboto</option>
                  <option value="Open Sans">Open Sans</option>
                  <option value="Lato">Lato</option>
                </select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="logoUrl">Logo URL (optional)</Label>
                <Input
                  id="logoUrl"
                  value={settings.logoUrl ?? ""}
                  onChange={(e) => update("logoUrl", e.target.value || null)}
                  placeholder="https://example.com/logo.png"
                />
                <p className="text-xs text-muted-foreground">Upload your logo to a public URL and paste it here. Future: upload directly.</p>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="headerText">Header text (optional)</Label>
                <Input
                  id="headerText"
                  value={settings.headerText ?? ""}
                  onChange={(e) => update("headerText", e.target.value)}
                  placeholder="Phone, email, registration number"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="footerText">Footer text</Label>
                <Input
                  id="footerText"
                  value={settings.footerText ?? ""}
                  onChange={(e) => update("footerText", e.target.value)}
                />
              </div>
            </div>
          </section>
        )}

        {/* Field toggles (for modern/classic) */}
        {settings.templateType !== "custom-html" && (
          <section className="rounded-lg border border-border bg-surface-raised p-5">
            <h2 className="text-base font-semibold">Show on invoice</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={settings.showTaxColumn}
                  onChange={(e) => update("showTaxColumn", e.target.checked)}
                  className="size-4 accent-[var(--primary)]"
                />
                Tax column
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={settings.showCustomerTrn}
                  onChange={(e) => update("showCustomerTrn", e.target.checked)}
                  className="size-4 accent-[var(--primary)]"
                />
                Customer TRN
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={settings.showProjectColumn}
                  onChange={(e) => update("showProjectColumn", e.target.checked)}
                  className="size-4 accent-[var(--primary)]"
                />
                Project column
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={settings.showPaymentTerms}
                  onChange={(e) => update("showPaymentTerms", e.target.checked)}
                  className="size-4 accent-[var(--primary)]"
                />
                Payment terms
              </label>
            </div>
          </section>
        )}

        {/* Custom HTML editor */}
        {settings.templateType === "custom-html" && (
          <section className="rounded-lg border border-border bg-surface-raised p-5">
            <h2 className="text-base font-semibold">Custom HTML template</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Write HTML with Handlebars variables. Use <code className="rounded bg-surface-muted px-1">{{"{{invoice.number}}"}}</code>,{" "}
              <code className="rounded bg-surface-muted px-1">{{"{{customer.name}}"}}</code>,{" "}
              <code className="rounded bg-surface-muted px-1">{{"{{#each lines}}"}}</code>.
            </p>
            <textarea
              value={settings.customHtml}
              onChange={(e) => update("customHtml", e.target.value)}
              className="mt-4 h-96 w-full rounded-md border border-border-strong bg-surface p-3 font-mono text-xs"
              placeholder={`<!DOCTYPE html>\n<html>\n<head>\n  <style>\n    body { font-family: sans-serif; padding: 40px; }\n    table { width: 100%; border-collapse: collapse; }\n    th, td { padding: 8px; border-bottom: 1px solid #ddd; text-align: left; }\n  </style>\n</head>\n<body>\n  <h1>INVOICE {{invoice.invoiceNumber}}</h1>\n  <p>{{customer.name}}</p>\n  <table>\n    <thead><tr><th>Description</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead>\n    <tbody>\n      {{#each lines}}\n      <tr><td>{{description}}</td><td>{{quantity}}</td><td>{{unitPrice}}</td><td>{{amount}}</td></tr>\n      {{/each}}\n    </tbody>\n  </table>\n</body>\n</html>`}
            />
          </section>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={preview} disabled={previewing}>
            {previewing ? <LoaderCircle className="size-4 animate-spin" /> : <Eye className="size-4" />}
            Live Preview
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving && <LoaderCircle className="size-4 animate-spin" />}
            Save
          </Button>
        </div>
      </div>

      {/* Info panel */}
      <aside className="space-y-4">
        <div className="rounded-lg border border-info/20 bg-info/5 p-4 text-sm">
          <p className="font-medium">Template settings</p>
          <p className="mt-1 text-muted-foreground">
            Changes apply to all sales invoice PDFs in this business. Click "Live Preview" to see the result with sample data.
          </p>
        </div>
        {settings.templateType === "custom-html" && (
          <div className="rounded-lg border border-warning/20 bg-warning/5 p-4 text-sm">
            <p className="font-medium">Custom HTML notes</p>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-muted-foreground">
              <li>HTML is rendered server-side via a headless browser.</li>
              <li>Available variables: invoice, customer, lines, settings.</li>
              <li>Use <code>{"{{#each lines}}"}</code> for line items.</li>
              <li>Keep CSS inline or in a <code>{"<style>"}</code> tag.</li>
            </ul>
          </div>
        )}
      </aside>
    </div>
  );
}
```

### 2.8 Create the actions file

Create `src/modules/document-templates/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireModule } from "@/core/permissions/require-module";
import { saveTemplateSettings } from "./template-settings";

export type SettingsResult = { error?: string };

export async function saveTemplateSettingsAction(
  businessId: string,
  documentType: string,
  settings: unknown,
): Promise<SettingsResult> {
  const { user } = await requireModule(businessId, "settings");
  try {
    saveTemplateSettings(businessId, user.id, documentType, settings);
    revalidatePath(`/b/${businessId}/settings/document-templates`);
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not save template settings" };
  }
}
```

### 2.9 Verify

```bash
npm run typecheck
npm run lint
npm run db:migrate  # run the new migration
npm run dev
```
- Go to Settings → Document Templates.
- Change primary color, font, toggles.
- Click Save.
- Click Live Preview — should open a PDF in a new tab.

### 2.10 Commit
```bash
git add -A && git commit -m "sprint-2: settings schema, settings page, live preview, template registry"
```

---

## Day 3: HTML template rendering with Puppeteer

### 3.1 Create the HTML render function

Create `src/modules/document-templates/html-templates/render.ts`:

```ts
import Handlebars from "handlebars";
import puppeteer from "puppeteer";

export async function renderHtmlTemplate(html: string, data: unknown, settings?: unknown): Promise<Buffer> {
  const compiled = Handlebars.compile(html);
  const rendered = compiled({ invoice: data, customer: (data as any)?.customerName, lines: (data as any)?.lines, settings });

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(rendered, { waitUntil: "networkidle0" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "20mm", bottom: "20mm", left: "15mm", right: "15mm" },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
```

### 3.2 Create default HTML templates

Create `src/modules/document-templates/html-templates/defaults/modern.html.hbs`:

```hbs
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: {{settings.fontName}}, sans-serif; color: #202936; padding: 40px; font-size: 12px; }
    .header { display: flex; justify-content: space-between; margin-bottom: 30px; }
    .company { color: {{settings.primaryColor}}; font-weight: 600; }
    .invoice-title { font-size: 28px; font-weight: bold; color: {{settings.primaryColor}}; }
    .section-title { font-size: 10px; color: #657184; text-transform: uppercase; margin-bottom: 4px; }
    .bill-to { margin-bottom: 20px; }
    .customer-name { font-size: 14px; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th { background: #edf1f5; padding: 8px; text-align: left; font-size: 10px; border-bottom: 1px solid #cbd4df; }
    td { padding: 8px; border-bottom: 1px solid #dce2e9; font-size: 11px; }
    .right { text-align: right; }
    .totals { margin-top: 20px; margin-left: auto; width: 250px; }
    .totals-row { display: flex; justify-content: space-between; padding: 4px 0; }
    .total { font-weight: bold; font-size: 14px; border-top: 1px solid #dce2e9; padding-top: 8px; margin-top: 4px; }
    .footer { position: fixed; bottom: 20px; left: 40px; right: 40px; text-align: center; font-size: 9px; color: #657184; border-top: 1px solid #dce2e9; padding-top: 8px; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      {{#if settings.logoUrl}}<img src="{{settings.logoUrl}}" style="max-height: 40px; max-width: 120px;" />{{/if}}
      <div class="company">{{invoice.companyName}}</div>
      {{#if settings.headerText}}<div style="font-size: 9px; color: #657184;">{{settings.headerText}}</div>{{/if}}
    </div>
    <div style="text-align: right;">
      <div class="invoice-title">INVOICE</div>
      <div>{{invoice.invoiceNumber}}</div>
      <div style="font-size: 10px; color: #657184;">{{invoice.invoiceDate}}</div>
      <div style="font-size: 10px; color: #657184;">{{invoice.dueDate}}</div>
    </div>
  </div>

  <div class="bill-to">
    <div class="section-title">Bill To</div>
    <div class="customer-name">{{invoice.customerName}}</div>
    {{#if invoice.customerTrn}}<div style="font-size: 10px; color: #657184;">TRN: {{invoice.customerTrn}}</div>{{/if}}
  </div>

  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th class="right">Qty</th>
        <th class="right">Rate</th>
        <th class="right">Amount</th>
      </tr>
    </thead>
    <tbody>
      {{#each invoice.lines}}
      <tr>
        <td>{{description}}</td>
        <td class="right">{{quantity}}</td>
        <td class="right">{{unitPrice}}</td>
        <td class="right">{{amount}}</td>
      </tr>
      {{/each}}
    </tbody>
  </table>

  <div class="totals">
    <div class="totals-row"><span>Subtotal</span><span>{{invoice.subtotal}}</span></div>
    {{#if settings.showTaxColumn}}
    <div class="totals-row"><span>VAT</span><span>{{invoice.tax}}</span></div>
    {{/if}}
    <div class="totals-row total"><span>Total</span><span>{{invoice.total}}</span></div>
  </div>

  {{#if settings.footerText}}
  <div class="footer">{{settings.footerText}}</div>
  {{/if}}
</body>
</html>
```

### 3.3 Add a preview API route

Create `src/app/api/businesses/[businessId]/invoices/preview-pdf/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getCurrentSession } from "@/core/auth/session";
import { getDocumentPdfAccess } from "@/core/permissions/document-pdf-access";
import { renderInvoicePdf } from "@/modules/document-templates/template-registry";
import { getTemplateSettings } from "@/modules/document-templates/template-settings";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ businessId: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { businessId } = await params;
  const access = getDocumentPdfAccess(businessId, session.user.id, "sales-invoice");
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Sample data for preview
  const sampleData = {
    companyName: access.business.name,
    invoiceNumber: "INV-PREVIEW",
    invoiceDate: "Invoice date: " + new Date().toLocaleDateString(),
    dueDate: "Due date: " + new Date(Date.now() + 14 * 86400000).toLocaleDateString(),
    customerName: "Sample Customer LLC",
    customerTrn: "100123456700003",
    lines: [
      { description: "Consulting services", quantity: "10", unitPrice: "450.00", amount: "4,500.00" },
      { description: "Site visit", quantity: "1", unitPrice: "500.00", amount: "500.00" },
      { description: "Materials", quantity: "5", unitPrice: "120.00", amount: "600.00" },
    ],
    subtotal: "5,600.00",
    tax: "280.00",
    total: "5,880.00",
  };

  try {
    const pdf = await renderInvoicePdf(businessId, session.user.id, sampleData);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="invoice-preview.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Preview failed" },
      { status: 500 }
    );
  }
}
```

### 3.4 Verify
```bash
npm run typecheck
npm run lint
npm run dev
```
- Go to Settings → Document Templates.
- Select "Custom HTML".
- Paste the modern.html.hbs content.
- Click Live Preview — should render a PDF via Puppeteer.
- Switch back to "Modern" — should render via React.

### 3.5 Commit
```bash
git add -A && git commit -m "sprint-2: HTML template rendering with Puppeteer + preview route"
```

---

## Day 4: Migrate other document types + remove pdfme

### 4.1 Create credit note template

Create `src/modules/document-templates/react-pdf/credit-note-template.tsx` (similar to invoice but with "CREDIT NOTE" title and credit-note-specific fields).

### 4.2 Create purchase order template

Create `src/modules/document-templates/react-pdf/purchase-order-template.tsx`.

### 4.3 Create receipt template

Create `src/modules/document-templates/react-pdf/receipt-template.tsx`.

### 4.4 Update the template registry

Open `src/modules/document-templates/template-registry.ts`. Add functions for each document type:

```ts
export async function renderCreditNotePdf(businessId, userId, data) { /* ... */ }
export async function renderPurchaseOrderPdf(businessId, userId, data) { /* ... */ }
export async function renderReceiptPdf(businessId, userId, data) { /* ... */ }
```

### 4.5 Update all PDF API routes

Update these routes to use the new registry:
- `src/app/api/businesses/[businessId]/documents/[documentType]/[documentId]/pdf/route.ts`
- Any credit note, PO, receipt PDF routes.

### 4.6 Remove pdfme

```bash
bun remove @pdfme/common @pdfme/generator @pdfme/schemas @pdfme/ui
```

Delete old pdfme files:
```bash
rm src/modules/document-templates/pdf-engine.ts
rm src/modules/document-templates/default-invoice-template.ts
rm src/modules/document-templates/template-designer.tsx  # the old drag-drop designer
```

### 4.7 Verify
```bash
npm run typecheck  # must pass — no pdfme imports remaining
npm run lint
npm run test
npm run dev
```
- Test all PDF routes: invoice, credit note, PO, receipt.
- Test all three template types: modern, classic, custom-html.

### 4.8 Commit
```bash
git add -A && git commit -m "sprint-2: migrate all document types + remove pdfme"
```

---

## Day 5: Polish + migration helper + final verification

### 5.1 Add migration helper for existing pdfme templates

Create `src/modules/document-templates/migrate-from-pdfme.ts`:

```ts
import { defaultSettings, type TemplateSettings } from "./template-settings";

// Convert old pdfme template JSON to new settings format
export function migratePdfmeTemplate(pdfmeJson: unknown): TemplateSettings {
  // pdfme templates don't map 1:1 to settings.
  // Best effort: extract colors, keep defaults for everything else.
  try {
    const old = pdfmeJson as any;
    const firstSchema = old.schemas?.[0]?.[0];
    const primaryColor = firstSchema?.fontColor?.startsWith("#") ? firstSchema.fontColor : defaultSettings.primaryColor;
    return {
      ...defaultSettings,
      primaryColor,
    };
  } catch {
    return defaultSettings;
  }
}
```

### 5.2 Run the migration for existing businesses

Create a one-time script `scripts/migrate-templates.ts`:

```ts
import { migrateDatabases } from "../src/core/db/migrate";
import { getSystemDb } from "../src/core/db/system";
import { businesses } from "../src/core/db/system-schema";
import { openBusinessDatabase } from "../src/core/db/business";
import { defaultSettings } from "../src/modules/document-templates/template-settings";

migrateDatabases();

const registry = getSystemDb().select().from(businesses).all();
for (const business of registry) {
  const context = openBusinessDatabase(business.directoryKey);
  const rows = context.sqlite.prepare("SELECT id, template_json FROM document_templates WHERE settings_json IS NULL OR settings_json = ''").all() as any[];
  for (const row of rows) {
    const settings = JSON.stringify(defaultSettings);
    context.sqlite.prepare("UPDATE document_templates SET settings_json = ?, custom_html = '' WHERE id = ?").run(settings, row.id);
  }
  console.log(`Migrated ${rows.length} templates for ${business.name}`);
}
console.log("Template migration complete.");
```

Run it:
```bash
npm run scripts/migrate-templates.ts
```

### 5.3 Update the "Classic" template

If you want a distinct "Classic" template (different from "Modern"), create `src/modules/document-templates/react-pdf/classic-invoice-template.tsx` with a more traditional layout (centered header, bordered table, etc.).

Update the registry to pick based on `settings.templateType`:

```ts
export async function renderInvoicePdf(businessId, userId, data) {
  const settings = getTemplateSettings(businessId, userId, "sales-invoice");
  if (settings.templateType === "custom-html" && settings.customHtml) {
    return renderHtmlTemplate(settings.customHtml, data, settings);
  }
  const Component = settings.templateType === "classic" ? ClassicInvoiceDocument : InvoiceDocument;
  return renderReactPdf(<Component data={data} settings={settings} />);
}
```

### 5.4 Update documentation

Update `docs/CURRENT_STATE.md` to reflect the new PDF engine. Replace the pdfme-related notes with:

```markdown
- Document templates use `@react-pdf/renderer` for default React-component templates and Puppeteer for custom HTML templates. pdfme has been removed. Template settings (logo, colors, fonts, field toggles) are stored in `document_templates.settings_json`. Custom HTML templates are stored in `document_templates.custom_html`.
```

### 5.5 Final verification

```bash
npm run typecheck   # passes
npm run lint        # passes
npm run db:check    # passes
npm run test        # all tests pass
npm run build       # production build passes
npm run dev         # dev server starts
```

**Manual verification:**
- [ ] Invoice PDF renders with Modern template
- [ ] Invoice PDF renders with Classic template (if implemented)
- [ ] Invoice PDF renders with Custom HTML template
- [ ] Credit Note PDF renders
- [ ] Purchase Order PDF renders
- [ ] Receipt PDF renders
- [ ] Settings page saves correctly
- [ ] Live Preview works for all template types
- [ ] Font selection affects PDF output
- [ ] Color selection affects PDF output
- [ ] Field toggles (show tax, show TRN) work
- [ ] No pdfme imports remain (`rg "@pdfme" src/` returns 0)
- [ ] No console errors in browser

### 5.6 Final commit
```bash
git add -A && git commit -m "sprint-2: complete - pdfme replaced with @react-pdf/renderer + HTML templates"
```

---

## What's next

Sprint 2 is complete. The PDF engine is now robust, flexible, and TypeScript-native. The app is now:
- Fast to develop (Sprint 0: Bun + Turbopack)
- Correct and secure (Sprint 1: cache, boundaries, rate-limit, CSP)
- Flexible on PDFs (Sprint 2: React + HTML templates)

Move to feature work (Sprint 3+):
- Manual Journal Entries
- Balance Sheet, P&L, Cash Flow reports
- Quotes → Invoice conversion
- Purchase Credit Notes
