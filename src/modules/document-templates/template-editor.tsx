"use client";

import { useState } from "react";
import {
  LoaderCircle,
  Eye,
  Save,
  RotateCcw,
  ExternalLink,
  Download,
  Palette,
  Type,
  ImageIcon,
  FileText,
  LayoutGrid,
  Stamp,
  Sparkles,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectNative } from "@/components/ui/select-native";
import { saveTemplateSettingsAction } from "./actions";
import { defaultSettings, type TemplateSettings } from "./template-settings";

const TYPE_LABELS: Record<string, string> = {
  "sales-invoice": "Sales Invoice",
  "sales-quote": "Sales Quote",
  "sales-order": "Sales Order",
  "sales-credit-note": "Credit Note",
  "purchase-quote": "Purchase Quote",
  "purchase-order": "Purchase Order",
  "purchase-invoice": "Purchase Invoice",
  "debit-note": "Debit Note",
  "goods-receipt": "Goods Receipt",
  "delivery-note": "Delivery Note",
};

const COLOR_PRESETS = [
  { name: "Executive Navy", color: "#1e3a8a" },
  { name: "Modern Indigo", color: "#4f46e5" },
  { name: "Corporate Slate", color: "#334155" },
  { name: "Emerald Green", color: "#065f46" },
  { name: "Crimson Wine", color: "#991b1b" },
  { name: "Sleek Charcoal", color: "#18181b" },
  { name: "Sky Blue", color: "#0284c7" },
];

const WATERMARK_PRESETS = ["", "DRAFT", "PAID", "COPY", "ORIGINAL", "CONFIDENTIAL"];

type TabKey = "style" | "branding" | "content" | "columns" | "custom-html";

export function TemplateEditor({
  businessId,
  documentType,
  initialSettings,
}: {
  businessId: string;
  documentType: string;
  initialSettings: TemplateSettings;
}) {
  const [settings, setSettings] = useState<TemplateSettings>(initialSettings);
  const [activeTab, setActiveTab] = useState<TabKey>("style");
  const [saving, setSaving] = useState(false);
  const [refreshKey, setRefreshKey] = useState<number>(Date.now());
  const [previewLoading, setPreviewLoading] = useState(false);

  const typeLabel = TYPE_LABELS[documentType] || "Document";

  const previewUrl = `/api/businesses/${businessId}/document-templates/preview-pdf?type=${documentType}&_t=${refreshKey}`;

  const handleImageUpload = (key: keyof TemplateSettings) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      update(key, event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const update = (key: keyof TemplateSettings, value: unknown) => {
    setSettings((prev) => ({ ...prev, [key]: value as never }));
  };

  async function save() {
    setSaving(true);
    const result = await saveTemplateSettingsAction(businessId, documentType, settings);
    setSaving(false);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(`Template settings saved for ${typeLabel}`);
      setRefreshKey(Date.now());
    }
  }

  function handleReset() {
    if (confirm(`Reset ${typeLabel} template settings to system defaults?`)) {
      setSettings(defaultSettings);
      toast.info("Settings reset to defaults. Click 'Save' to apply.");
    }
  }

  async function triggerRefresh() {
    setPreviewLoading(true);
    // Auto-save changes so the preview URL immediately reflects them
    await saveTemplateSettingsAction(businessId, documentType, settings);
    setRefreshKey(Date.now());
    setTimeout(() => setPreviewLoading(false), 500);
  }

  return (
    <div className="space-y-6">
      {/* Top Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-surface p-4 shadow-xs">
        <div>
          <h2 className="text-base font-semibold text-foreground">
            {typeLabel} Template Studio
          </h2>
          <p className="text-xs text-muted-foreground">
            Configure layout, typography, branding, and PDF document rules.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={handleReset} title="Reset to default template settings">
            <RotateCcw className="size-3.5 text-muted-foreground" />
            Reset
          </Button>

          <Button variant="secondary" size="sm" onClick={triggerRefresh} disabled={previewLoading}>
            {previewLoading ? <LoaderCircle className="size-3.5 animate-spin" /> : <Eye className="size-3.5" />}
            Refresh Preview
          </Button>

          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? <LoaderCircle className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
            Save Template
          </Button>
        </div>
      </div>

      {/* Main Split Layout */}
      <div className="grid items-start gap-8 lg:grid-cols-12">
        {/* Left Column: Controls (5 cols) */}
        <div className="space-y-6 lg:col-span-5">
          {/* Navigation Tabs */}
          <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-surface-muted/40 p-1">
            <button
              type="button"
              onClick={() => setActiveTab("style")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                activeTab === "style" ? "bg-surface text-primary shadow-xs" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Palette className="size-3.5" />
              Style & Engine
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("branding")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                activeTab === "branding" ? "bg-surface text-primary shadow-xs" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <ImageIcon className="size-3.5" />
              Logo & Branding
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("content")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                activeTab === "content" ? "bg-surface text-primary shadow-xs" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <FileText className="size-3.5" />
              Content & Details
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("columns")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                activeTab === "columns" ? "bg-surface text-primary shadow-xs" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <LayoutGrid className="size-3.5" />
              Columns
            </button>

            {settings.templateType === "custom-html" && (
              <button
                type="button"
                onClick={() => setActiveTab("custom-html")}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  activeTab === "custom-html" ? "bg-surface text-primary shadow-xs" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Sparkles className="size-3.5" />
                HTML Source
              </button>
            )}
          </div>

          {/* TAB 1: STYLE & ENGINE */}
          {activeTab === "style" && (
            <div className="space-y-6">
              {/* Template Engine */}
              <section className="rounded-xl border border-border bg-surface p-4 shadow-2xs">
                <h3 className="text-sm font-semibold text-foreground">Template Layout Engine</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">Select the structural rendering engine for this document.</p>
                <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                  {[
                    { id: "modern", name: "Modern", desc: "Contemporary layout with subtle brand accents" },
                    { id: "classic", name: "Classic", desc: "Formal boxed accounting design with double rules" },
                    { id: "minimal", name: "Minimal", desc: "Sleek Swiss typography with clean hairlines" },
                    { id: "custom-html", name: "Custom HTML", desc: "Write custom Handlebars HTML & CSS templates" },
                  ].map((engine) => (
                    <button
                      key={engine.id}
                      type="button"
                      onClick={() => update("templateType", engine.id)}
                      className={`flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-all ${
                        settings.templateType === engine.id
                          ? "border-primary bg-primary/5 text-primary ring-1 ring-primary/30"
                          : "border-border bg-surface hover:bg-surface-muted/50"
                      }`}
                    >
                      <span className="text-xs font-semibold text-foreground">{engine.name}</span>
                      <span className="text-[11px] text-muted-foreground">{engine.desc}</span>
                    </button>
                  ))}
                </div>
              </section>

              {/* Color Palette */}
              {settings.templateType !== "custom-html" && (
                <section className="rounded-xl border border-border bg-surface p-4 shadow-2xs">
                  <h3 className="text-sm font-semibold text-foreground">Brand Color Palette</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">Sets document headers, accents, totals, and table dividers.</p>

                  <div className="mt-3 space-y-3">
                    <div className="flex items-center gap-3">
                      <input
                        id="primaryColor"
                        type="color"
                        value={settings.primaryColor}
                        onChange={(e) => update("primaryColor", e.target.value)}
                        className="size-9 cursor-pointer rounded-lg border border-border-strong p-0.5"
                      />
                      <Input
                        value={settings.primaryColor}
                        onChange={(e) => update("primaryColor", e.target.value)}
                        className="max-w-[130px] font-mono text-xs uppercase"
                      />
                      <span className="text-xs text-muted-foreground">Primary Accent</span>
                    </div>

                    {/* Quick Presets */}
                    <div>
                      <span className="text-[11px] font-medium text-muted-foreground">Quick Palette Presets:</span>
                      <div className="mt-1.5 flex flex-wrap gap-2">
                        {COLOR_PRESETS.map((preset) => (
                          <button
                            key={preset.color}
                            type="button"
                            onClick={() => update("primaryColor", preset.color)}
                            title={preset.name}
                            className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors ${
                              settings.primaryColor.toLowerCase() === preset.color.toLowerCase()
                                ? "border-primary bg-primary/10 text-primary font-medium"
                                : "border-border hover:bg-surface-muted text-muted-foreground"
                            }`}
                          >
                            <span className="size-2.5 rounded-full" style={{ backgroundColor: preset.color }} />
                            {preset.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </section>
              )}

              {/* Typography */}
              {settings.templateType !== "custom-html" && (
                <section className="rounded-xl border border-border bg-surface p-4 shadow-2xs">
                  <h3 className="text-sm font-semibold text-foreground">Typography & Sizing</h3>
                  <div className="mt-3 grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="fontName" className="text-xs">Font Family</Label>
                      <SelectNative
                        id="fontName"
                        value={settings.fontName}
                        onChange={(e) => update("fontName", e.target.value as TemplateSettings["fontName"])}
                      >
                        <option value="Inter">Inter (Clean & Modern)</option>
                        <option value="Roboto">Roboto (Geometric)</option>
                        <option value="Open Sans">Open Sans (Humanist)</option>
                        <option value="Lato">Lato (Warm & Elegant)</option>
                      </SelectNative>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="fontSize" className="text-xs">Document Density</Label>
                      <SelectNative
                        id="fontSize"
                        value={settings.fontSize ?? "normal"}
                        onChange={(e) => update("fontSize", e.target.value as TemplateSettings["fontSize"])}
                      >
                        <option value="small">Small (Dense / Multi-item)</option>
                        <option value="normal">Normal (Standard balanced)</option>
                        <option value="large">Large (Spacious / High legibility)</option>
                      </SelectNative>
                    </div>
                  </div>
                </section>
              )}
            </div>
          )}

          {/* TAB 2: BRANDING & LETTERHEAD */}
          {activeTab === "branding" && (
            <div className="space-y-6">
              {/* Logo Settings */}
              <section className="rounded-xl border border-border bg-surface p-4 shadow-2xs">
                <h3 className="text-sm font-semibold text-foreground">Company Logo</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">Upload a high-resolution PNG, JPG, or SVG brand logo.</p>

                <div className="mt-3 space-y-3">
                  <div className="flex items-center gap-2">
                    <Input
                      id="logoUrl"
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload("logoUrl")}
                      className="text-xs"
                    />
                    {settings.logoUrl && (
                      <Button type="button" variant="secondary" size="sm" onClick={() => update("logoUrl", null)}>
                        Clear
                      </Button>
                    )}
                  </div>

                  {settings.logoUrl && (
                    <div className="flex items-center gap-4 rounded-lg border border-border/60 bg-surface-muted/30 p-2.5">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={settings.logoUrl} alt="Logo preview" className="h-10 max-w-[120px] object-contain" />
                      <span className="text-xs text-muted-foreground">Custom logo uploaded</span>
                    </div>
                  )}

                  {/* Logo Alignment */}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Logo Alignment</Label>
                      <div className="flex gap-1.5">
                        {(["left", "center", "right"] as const).map((pos) => (
                          <button
                            key={pos}
                            type="button"
                            onClick={() => update("logoPosition", pos)}
                            className={`flex-1 rounded-md border py-1.5 text-xs font-medium capitalize transition-colors ${
                              (settings.logoPosition ?? "left") === pos
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border text-muted-foreground hover:bg-surface-muted"
                            }`}
                          >
                            {pos}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">Logo Size</Label>
                      <div className="flex gap-1.5">
                        {(["small", "medium", "large"] as const).map((sz) => (
                          <button
                            key={sz}
                            type="button"
                            onClick={() => update("logoSize", sz)}
                            className={`flex-1 rounded-md border py-1.5 text-xs font-medium capitalize transition-colors ${
                              (settings.logoSize ?? "medium") === sz
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border text-muted-foreground hover:bg-surface-muted"
                            }`}
                          >
                            {sz}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* Header & Footer Banners */}
              <section className="rounded-xl border border-border bg-surface p-4 shadow-2xs">
                <h3 className="text-sm font-semibold text-foreground">Full-Width Letterhead Banners</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">Optional full-width graphics for official corporate letterheads.</p>

                <div className="mt-3 space-y-3">
                  <div className="space-y-1">
                    <Label htmlFor="headerImageUrl" className="text-xs">Header Graphic Banner</Label>
                    <div className="flex gap-2">
                      <Input
                        id="headerImageUrl"
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload("headerImageUrl")}
                        className="text-xs"
                      />
                      {settings.headerImageUrl && (
                        <Button type="button" variant="secondary" size="sm" onClick={() => update("headerImageUrl", null)}>Clear</Button>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="footerImageUrl" className="text-xs">Footer Graphic Banner</Label>
                    <div className="flex gap-2">
                      <Input
                        id="footerImageUrl"
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload("footerImageUrl")}
                        className="text-xs"
                      />
                      {settings.footerImageUrl && (
                        <Button type="button" variant="secondary" size="sm" onClick={() => update("footerImageUrl", null)}>Clear</Button>
                      )}
                    </div>
                  </div>
                </div>
              </section>

              {/* Taglines */}
              <section className="rounded-xl border border-border bg-surface p-4 shadow-2xs">
                <h3 className="text-sm font-semibold text-foreground">Header & Footer Messages</h3>
                <div className="mt-3 space-y-3">
                  <div className="space-y-1">
                    <Label htmlFor="headerText" className="text-xs">Header Tagline / Subtitle</Label>
                    <Input
                      id="headerText"
                      value={settings.headerText ?? ""}
                      onChange={(e) => update("headerText", e.target.value)}
                      placeholder="e.g. Authorized Distributor • ISO 9001 Certified"
                      className="text-xs"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="footerText" className="text-xs">Footer Thank-You Text</Label>
                    <Input
                      id="footerText"
                      value={settings.footerText ?? ""}
                      onChange={(e) => update("footerText", e.target.value)}
                      placeholder="Thank you for your business"
                      className="text-xs"
                    />
                  </div>
                </div>
              </section>
            </div>
          )}

          {/* TAB 3: CONTENT & DETAILS */}
          {activeTab === "content" && (
            <div className="space-y-6">
              {/* Payment Instructions / Bank Details */}
              <section className="rounded-xl border border-border bg-surface p-4 shadow-2xs">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Payment & Bank Details</h3>
                    <p className="text-xs text-muted-foreground">Print remittance bank instructions on documents.</p>
                  </div>
                  <input
                    type="checkbox"
                    id="showPaymentInstructions"
                    checked={settings.showPaymentInstructions ?? false}
                    onChange={(e) => update("showPaymentInstructions", e.target.checked)}
                    className="size-4 accent-primary"
                  />
                </div>

                {settings.showPaymentInstructions && (
                  <div className="mt-3 space-y-2">
                    <Label htmlFor="paymentInstructions" className="text-xs">Bank Details / Remittance Text</Label>
                    <textarea
                      id="paymentInstructions"
                      value={settings.paymentInstructions ?? ""}
                      onChange={(e) => update("paymentInstructions", e.target.value)}
                      rows={3}
                      placeholder={`Bank: Emirates NBD\nAccount: 1012345678\nIBAN: AE070260000101234567801\nSWIFT: EBILAEAD`}
                      className="w-full rounded-md border border-border bg-surface p-2.5 font-mono text-xs text-foreground focus:ring-1 focus:ring-primary focus:outline-hidden"
                    />
                  </div>
                )}
              </section>

              {/* Watermark */}
              <section className="rounded-xl border border-border bg-surface p-4 shadow-2xs">
                <h3 className="text-sm font-semibold text-foreground">Document Watermark</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">Faint diagonal text stamped across the page.</p>

                <div className="mt-3 space-y-2">
                  <Input
                    value={settings.watermarkText ?? ""}
                    onChange={(e) => update("watermarkText", e.target.value)}
                    placeholder="e.g. DRAFT, PAID, COPY (leave empty for none)"
                    className="text-xs"
                  />
                  <div className="flex flex-wrap gap-1.5">
                    {WATERMARK_PRESETS.map((wm) => (
                      <button
                        key={wm || "none"}
                        type="button"
                        onClick={() => update("watermarkText", wm)}
                        className={`rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors ${
                          (settings.watermarkText ?? "") === wm
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-muted-foreground hover:bg-surface-muted"
                        }`}
                      >
                        {wm || "None"}
                      </button>
                    ))}
                  </div>
                </div>
              </section>

              {/* Authorized Signature Block */}
              <section className="rounded-xl border border-border bg-surface p-4 shadow-2xs">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Authorized Signature / Stamp</h3>
                    <p className="text-xs text-muted-foreground">Render a sign-off or stamp box at the bottom right.</p>
                  </div>
                  <input
                    type="checkbox"
                    id="showSignatureBlock"
                    checked={settings.showSignatureBlock ?? false}
                    onChange={(e) => update("showSignatureBlock", e.target.checked)}
                    className="size-4 accent-primary"
                  />
                </div>

                {settings.showSignatureBlock && (
                  <div className="mt-3 space-y-3">
                    <div className="space-y-1">
                      <Label htmlFor="signatureLabel" className="text-xs">Signature Label</Label>
                      <Input
                        id="signatureLabel"
                        value={settings.signatureLabel ?? "Authorized Signatory"}
                        onChange={(e) => update("signatureLabel", e.target.value)}
                        className="text-xs"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor="signatureImageUrl" className="text-xs">Scanned Signature / Stamp (Optional)</Label>
                      <div className="flex gap-2">
                        <Input
                          id="signatureImageUrl"
                          type="file"
                          accept="image/*"
                          onChange={handleImageUpload("signatureImageUrl")}
                          className="text-xs"
                        />
                        {settings.signatureImageUrl && (
                          <Button type="button" variant="secondary" size="sm" onClick={() => update("signatureImageUrl", null)}>Clear</Button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </section>
            </div>
          )}

          {/* TAB 4: TABLE COLUMNS & FIELDS */}
          {activeTab === "columns" && (
            <div className="space-y-6">
              <section className="rounded-xl border border-border bg-surface p-4 shadow-2xs">
                <h3 className="text-sm font-semibold text-foreground">Table Columns & Field Visibility</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">Control which columns and blocks appear on {typeLabel} PDFs.</p>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label className="flex items-center gap-2.5 text-xs text-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.showTaxColumn ?? true}
                      onChange={(e) => update("showTaxColumn", e.target.checked)}
                      className="size-4 rounded accent-primary"
                    />
                    Tax / VAT Column
                  </label>

                  <label className="flex items-center gap-2.5 text-xs text-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.showDiscountColumn ?? true}
                      onChange={(e) => update("showDiscountColumn", e.target.checked)}
                      className="size-4 rounded accent-primary"
                    />
                    Discount Column
                  </label>

                  <label className="flex items-center gap-2.5 text-xs text-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.showProjectColumn ?? false}
                      onChange={(e) => update("showProjectColumn", e.target.checked)}
                      className="size-4 rounded accent-primary"
                    />
                    Project Column
                  </label>

                  <label className="flex items-center gap-2.5 text-xs text-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.showCustomerTrn ?? true}
                      onChange={(e) => update("showCustomerTrn", e.target.checked)}
                      className="size-4 rounded accent-primary"
                    />
                    Client / Supplier TRN
                  </label>

                  <label className="flex items-center gap-2.5 text-xs text-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.showNotes ?? true}
                      onChange={(e) => update("showNotes", e.target.checked)}
                      className="size-4 rounded accent-primary"
                    />
                    Document Notes & Remarks
                  </label>

                  <label className="flex items-center gap-2.5 text-xs text-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.showPaymentTerms ?? true}
                      onChange={(e) => update("showPaymentTerms", e.target.checked)}
                      className="size-4 rounded accent-primary"
                    />
                    Terms & Conditions
                  </label>

                  <label className="flex items-center gap-2.5 text-xs text-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.showPageNumbers ?? true}
                      onChange={(e) => update("showPageNumbers", e.target.checked)}
                      className="size-4 rounded accent-primary"
                    />
                    Page Numbers (Page X of Y)
                  </label>

                  <label className="flex items-center gap-2.5 text-xs text-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.showCompanyAddress ?? true}
                      onChange={(e) => update("showCompanyAddress", e.target.checked)}
                      className="size-4 rounded accent-primary"
                    />
                    Company Address
                  </label>

                  <label className="flex items-center gap-2.5 text-xs text-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.showCompanyTrn ?? true}
                      onChange={(e) => update("showCompanyTrn", e.target.checked)}
                      className="size-4 rounded accent-primary"
                    />
                    Company TRN / Tax ID
                  </label>

                  <label className="flex items-center gap-2.5 text-xs text-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.showCustomFields ?? true}
                      onChange={(e) => update("showCustomFields", e.target.checked)}
                      className="size-4 rounded accent-primary"
                    />
                    Custom Entity Fields
                  </label>
                </div>
              </section>
            </div>
          )}

          {/* TAB 5: CUSTOM HTML */}
          {activeTab === "custom-html" && settings.templateType === "custom-html" && (
            <div className="space-y-4">
              <section className="rounded-xl border border-border bg-surface p-4 shadow-2xs">
                <h3 className="text-sm font-semibold text-foreground">Custom Handlebars Template</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Use variables like <code className="rounded bg-surface-muted px-1">{"{{invoiceNumber}}"}</code>,{" "}
                  <code className="rounded bg-surface-muted px-1">{"{{customerName}}"}</code>,{" "}
                  <code className="rounded bg-surface-muted px-1">{"{{#each lines}}"}</code>.
                </p>

                <textarea
                  value={settings.customHtml ?? ""}
                  onChange={(e) => update("customHtml", e.target.value)}
                  className="mt-3 h-80 w-full rounded-md border border-border bg-surface p-3 font-mono text-xs text-foreground focus:ring-1 focus:ring-primary focus:outline-hidden"
                  placeholder="<!DOCTYPE html><html><body><h1>{{invoiceTitle}} {{invoiceNumber}}</h1>...</body></html>"
                />
              </section>
            </div>
          )}
        </div>

        {/* Right Column: Live Studio Preview (7 cols) */}
        <div className="lg:col-span-7">
          <div className="sticky top-6 rounded-xl border border-border bg-surface shadow-xs overflow-hidden">
            {/* Preview Toolbar */}
            <div className="flex items-center justify-between border-b border-border bg-surface-muted/30 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <span className="flex size-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-semibold text-foreground">Live Document Preview</span>
                <span className="rounded-md border border-border bg-surface px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground uppercase">
                  {settings.templateType}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <a
                  href={previewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-1 text-xs text-muted-foreground hover:bg-surface-muted hover:text-foreground transition-colors"
                  title="Open full PDF in new tab"
                >
                  <ExternalLink className="size-3" />
                  Full Tab
                </a>

                <a
                  href={previewUrl}
                  download={`${documentType}-sample.pdf`}
                  className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-1 text-xs text-muted-foreground hover:bg-surface-muted hover:text-foreground transition-colors"
                  title="Download sample PDF"
                >
                  <Download className="size-3" />
                  Download
                </a>
              </div>
            </div>

            {/* Embedded Native PDF Viewer */}
            <div className="relative min-h-[680px] w-full bg-neutral-100 dark:bg-neutral-900">
              <iframe
                key={refreshKey}
                src={previewUrl}
                className="h-[680px] w-full border-0"
                title={`${typeLabel} Live PDF Preview`}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
