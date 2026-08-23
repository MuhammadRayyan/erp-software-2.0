"use client";

import { useState } from "react";
import { LoaderCircle, Eye } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveTemplateSettingsAction } from "./actions";
import type { TemplateSettings } from "./template-settings";
import { SelectNative } from "@/components/ui/select-native";


export function TemplateEditor({ businessId, initialSettings }: { businessId: string; initialSettings: TemplateSettings }) {
  const [settings, setSettings] = useState<TemplateSettings>(initialSettings);

  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [loading] = useState(false);

  const update = (key: keyof TemplateSettings, value: unknown) => {
    setSettings((prev) => ({ ...prev, [key]: value as never }));
  };

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
      await saveTemplateSettingsAction(businessId, "sales-invoice", settings);
      const url = `/api/businesses/${businessId}/invoices/preview-pdf?_t=${Date.now()}`;
      window.open(url, "_blank");
    } catch {
      toast.error("Preview failed");
    }
    setPreviewing(false);
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <LoaderCircle className="size-8 animate-spin text-muted-foreground/50" />
      </div>
    );
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-4">
      {/* Editor column */}
      <div className="space-y-6 lg:col-span-3">
        
        {/* Template choice */}
        <section className="rounded-lg border border-border bg-surface-raised p-5">
          <h2 className="text-base font-semibold">Engine</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {(["modern", "classic", "custom-html"] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => update("templateType", type)}
                className={`rounded-md border p-4 text-left text-sm transition-colors ${
                  settings.templateType === type
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-surface-muted"
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
                <SelectNative
                  id="fontName"
                  
                  value={settings.fontName}
                  onChange={(e) => update("fontName", e.target.value as TemplateSettings["fontName"])}
                >
                  <option value="Inter">Inter</option>
                  <option value="Roboto">Roboto</option>
                  <option value="Open Sans">Open Sans</option>
                  <option value="Lato">Lato</option>
                </SelectNative>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="logoUrl">Logo URL (optional)</Label>
                <Input
                  id="logoUrl"
                  value={settings.logoUrl ?? ""}
                  onChange={(e) => update("logoUrl", e.target.value || null)}
                  placeholder="https://example.com/logo.png"
                />
                <div>
                  <p className="text-sm font-medium text-foreground">Advanced HTML</p>
                  <p className="text-xs text-muted-foreground">Select &quot;Custom HTML&quot; to write your own structure.</p>
                </div>
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
              Write HTML with Handlebars variables. Use <code className="rounded bg-surface-muted px-1">{"{{invoice.invoiceNumber}}"}</code>,{" "}
              <code className="rounded bg-surface-muted px-1">{"{{customer.name}}"}</code>,{" "}
              <code className="rounded bg-surface-muted px-1">{"{{#each lines}}"}</code>.
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
            Changes apply to all sales invoice PDFs in this business. Click &quot;Live Preview&quot; to see the result with sample data.
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
