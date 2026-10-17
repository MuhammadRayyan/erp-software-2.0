"use client";

import { useState, useEffect, useTransition } from "react";
import {
  LoaderCircle,
  Eye,
  Save,
  RotateCcw,
  ExternalLink,
  Download,
  Palette,
  ImageIcon,
  FileText,
  LayoutGrid,
  Sparkles,
  Printer,
  Building2,
  Briefcase,
  Copy,
  Check,
  CreditCard,
  PenTool,
  Sliders,
  Type,
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
  { name: "Royal Purple", color: "#6b21a8" },
];

const WATERMARK_PRESETS = ["", "DRAFT", "PAID", "COPY", "ORIGINAL", "CONFIDENTIAL"];

const HTML_VARIABLES = [
  "{{companyName}}",
  "{{companyAddress}}",
  "{{sellerTrn}}",
  "{{invoiceTitle}}",
  "{{invoiceNumber}}",
  "{{invoiceDate}}",
  "{{dueDate}}",
  "{{customerName}}",
  "{{customerAddress}}",
  "{{customerTrn}}",
  "{{#each lines}}",
  "{{this.description}}",
  "{{this.quantity}}",
  "{{this.unitPrice}}",
  "{{this.amount}}",
  "{{/each}}",
  "{{subtotal}}",
  "{{tax}}",
  "{{total}}",
  "{{notes}}",
  "{{terms}}",
];

type TabKey = "stationary" | "style" | "branding" | "labels" | "bank" | "columns" | "custom-html";

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
  const [activeTab, setActiveTab] = useState<TabKey>("stationary");
  const [saving, setSaving] = useState(false);
  const [refreshKey, setRefreshKey] = useState<number>(0);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [copiedVar, setCopiedVar] = useState<string | null>(null);
  const [zoomHeight, setZoomHeight] = useState<number>(720);
  const [, startTransition] = useTransition();

  const typeLabel = TYPE_LABELS[documentType] || "Document";
  const previewUrl = `/api/businesses/${businessId}/document-templates/preview-pdf?type=${documentType}${refreshKey ? `&_t=${refreshKey}` : ""}`;

  // Live debounced auto-preview (350ms debounce)
  useEffect(() => {
    let active = true;
    let currentObjectUrl: string | null = null;

    const timer = setTimeout(async () => {
      setPreviewLoading(true);
      setPdfError(null);
      try {
        const response = await fetch(`/api/businesses/${businessId}/document-templates/preview-pdf`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ documentType, settings }),
        });
        if (!response.ok) {
          throw new Error(`Server returned HTTP ${response.status} (${response.statusText})`);
        }
        const blob = await response.blob();
        if (!active) return;
        currentObjectUrl = URL.createObjectURL(blob);
        setBlobUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return currentObjectUrl;
        });
      } catch (err: unknown) {
        if (!active) return;
        console.error("PDF Preview fetch error:", err);
        setPdfError(err instanceof Error ? err.message : "Failed to load live PDF preview");
      } finally {
        if (active) {
          setPreviewLoading(false);
        }
      }
    }, 350);

    return () => {
      active = false;
      clearTimeout(timer);
      if (currentObjectUrl) {
        URL.revokeObjectURL(currentObjectUrl);
      }
    };
  }, [businessId, documentType, settings, refreshKey]);

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

  const applyStarterPreset = (preset: (prev: TemplateSettings) => TemplateSettings) => {
    startTransition(() => {
      setSettings((prev) => preset(prev));
      toast.success("Starter preset applied! Live preview updated.");
    });
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

  const copyVariable = (v: string) => {
    navigator.clipboard.writeText(v);
    setCopiedVar(v);
    toast.success(`Copied ${v} to clipboard`);
    setTimeout(() => setCopiedVar(null), 1800);
  };

  return (
    <div className="space-y-6">
      {/* Top Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-surface p-4 shadow-xs">
        <div>
          <h2 className="text-base font-semibold text-foreground">
            {typeLabel} Template Studio
          </h2>
          <p className="text-xs text-muted-foreground">
            Design letterhead stationery, custom columns, typography, and live-preview changes in real time.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={handleReset} title="Reset to default template settings">
            <RotateCcw className="size-3.5 text-muted-foreground" />
            Reset
          </Button>

          <Button size="sm" onClick={save} disabled={saving} className="gap-1.5">
            {saving ? <LoaderCircle className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
            Save Template
          </Button>
        </div>
      </div>

      {/* 1-Click Starter Presets Bar */}
      <div className="rounded-xl border border-border bg-surface-muted/30 p-3.5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Sparkles className="size-3.5 text-primary" />
            Quick Starter Presets
          </span>
          <span className="text-[11px] text-muted-foreground">Click a preset to instantly reconfigure layout & styling</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          <button
            type="button"
            onClick={() =>
              applyStarterPreset((prev) => ({
                ...prev,
                templateType: "modern",
                primaryColor: "#1e3a8a",
                accentColor: "#3b82f6",
                letterheadMode: "digital",
                hideDigitalHeader: false,
                hideDigitalFooter: false,
                marginTop: 40,
                marginBottom: 40,
                marginLeft: 40,
                marginRight: 40,
                showSignatureBlock: true,
                signatureLayout: "dual",
                secondarySignatureLabel: "Prepared By",
                signatureLabel: "Authorized Signatory",
                showPaymentInstructions: true,
                customDocumentTitle: "TAX INVOICE",
              }))
            }
            className="flex items-start gap-2.5 rounded-lg border border-border bg-surface p-2.5 text-left hover:border-primary hover:bg-primary/5 transition-all group"
          >
            <div className="rounded-md bg-blue-500/10 p-2 text-blue-600 dark:text-blue-400 group-hover:scale-105 transition-transform">
              <Building2 className="size-4" />
            </div>
            <div>
              <p className="text-xs font-semibold text-foreground">Executive Corporate</p>
              <p className="text-[11px] text-muted-foreground line-clamp-1">Navy, dual signatures & bank details</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() =>
              applyStarterPreset((prev) => ({
                ...prev,
                templateType: "modern",
                primaryColor: "#334155",
                accentColor: "#64748b",
                letterheadMode: "digital",
                hideDigitalHeader: false,
                hideDigitalFooter: false,
                marginTop: 36,
                marginBottom: 36,
                marginLeft: 36,
                marginRight: 36,
                showSignatureBlock: true,
                signatureLayout: "single",
                signatureLabel: "Authorized Signatory",
                customDocumentTitle: "",
              }))
            }
            className="flex items-start gap-2.5 rounded-lg border border-border bg-surface p-2.5 text-left hover:border-primary hover:bg-primary/5 transition-all group"
          >
            <div className="rounded-md bg-slate-500/10 p-2 text-slate-600 dark:text-slate-400 group-hover:scale-105 transition-transform">
              <Sparkles className="size-4" />
            </div>
            <div>
              <p className="text-xs font-semibold text-foreground">Clean Modern</p>
              <p className="text-[11px] text-muted-foreground line-clamp-1">Slate accents, balanced borders</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() =>
              applyStarterPreset((prev) => ({
                ...prev,
                templateType: "classic",
                letterheadMode: "preprinted",
                hideDigitalHeader: true,
                hideDigitalFooter: true,
                marginTop: 120, // ~42mm offset
                marginBottom: 80, // ~28mm offset
                marginLeft: 40,
                marginRight: 40,
                showSignatureBlock: true,
                signatureLayout: "single",
              }))
            }
            className="flex items-start gap-2.5 rounded-lg border border-border bg-surface p-2.5 text-left hover:border-primary hover:bg-primary/5 transition-all group"
          >
            <div className="rounded-md bg-amber-500/10 p-2 text-amber-600 dark:text-amber-400 group-hover:scale-105 transition-transform">
              <Printer className="size-4" />
            </div>
            <div>
              <p className="text-xs font-semibold text-foreground">Pre-Printed Paper</p>
              <p className="text-[11px] text-muted-foreground line-clamp-1">Hide header, 42mm top offset for print</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() =>
              applyStarterPreset((prev) => ({
                ...prev,
                templateType: "minimal",
                primaryColor: "#4f46e5",
                accentColor: "#818cf8",
                letterheadMode: "digital",
                customDocumentTitle: "COMMERCIAL INVOICE",
                customDescriptionLabel: "Scope of Work / Service",
                customQuantityLabel: "Hours",
                customUnitPriceLabel: "Hourly Rate",
                customAmountLabel: "Line Total",
                customTotalLabel: "Total Amount Due",
                showSignatureBlock: true,
                signatureLayout: "single",
              }))
            }
            className="flex items-start gap-2.5 rounded-lg border border-border bg-surface p-2.5 text-left hover:border-primary hover:bg-primary/5 transition-all group"
          >
            <div className="rounded-md bg-indigo-500/10 p-2 text-indigo-600 dark:text-indigo-400 group-hover:scale-105 transition-transform">
              <Briefcase className="size-4" />
            </div>
            <div>
              <p className="text-xs font-semibold text-foreground">Service & Consulting</p>
              <p className="text-[11px] text-muted-foreground line-clamp-1">Hours, Rate, Scope of Work wording</p>
            </div>
          </button>
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
              onClick={() => setActiveTab("stationary")}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                activeTab === "stationary" ? "bg-surface text-primary shadow-xs" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Printer className="size-3.5" />
              Letterhead & Paper
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("style")}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                activeTab === "style" ? "bg-surface text-primary shadow-xs" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Palette className="size-3.5" />
              Style & Colors
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("branding")}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                activeTab === "branding" ? "bg-surface text-primary shadow-xs" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <ImageIcon className="size-3.5" />
              Logo & Banners
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("labels")}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                activeTab === "labels" ? "bg-surface text-primary shadow-xs" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Type className="size-3.5" />
              Labels & Wording
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("bank")}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                activeTab === "bank" ? "bg-surface text-primary shadow-xs" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <CreditCard className="size-3.5" />
              Bank & Signatures
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("columns")}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                activeTab === "columns" ? "bg-surface text-primary shadow-xs" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <LayoutGrid className="size-3.5" />
              Columns & Blocks
            </button>

            {settings.templateType === "custom-html" && (
              <button
                type="button"
                onClick={() => setActiveTab("custom-html")}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  activeTab === "custom-html" ? "bg-surface text-primary shadow-xs" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <FileText className="size-3.5" />
                Custom HTML
              </button>
            )}
          </div>

          {/* TAB 1: LETTERHEAD & PAPER SETUP */}
          {activeTab === "stationary" && (
            <div className="space-y-6">
              <section className="rounded-xl border border-border bg-surface p-4 shadow-2xs">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Printer className="size-4 text-primary" />
                  Letterhead & Stationery Mode
                </h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Choose how your company letterhead is applied when printing or emailing documents.
                </p>

                <div className="mt-3 grid grid-cols-1 gap-2.5">
                  <label
                    className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-all ${
                      settings.letterheadMode === "digital"
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-surface-muted/40"
                    }`}
                  >
                    <input
                      type="radio"
                      name="letterheadMode"
                      checked={settings.letterheadMode === "digital"}
                      onChange={() => update("letterheadMode", "digital")}
                      className="mt-0.5 size-4 accent-primary"
                    />
                    <div>
                      <p className="text-xs font-medium text-foreground">Full Digital Branding (Default)</p>
                      <p className="text-[11px] text-muted-foreground">
                        ERP renders company logo, company name, address, tax registration number, and headers digitally.
                      </p>
                    </div>
                  </label>

                  <label
                    className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-all ${
                      settings.letterheadMode === "preprinted"
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-surface-muted/40"
                    }`}
                  >
                    <input
                      type="radio"
                      name="letterheadMode"
                      checked={settings.letterheadMode === "preprinted"}
                      onChange={() => {
                        update("letterheadMode", "preprinted");
                        update("hideDigitalHeader", true);
                        update("hideDigitalFooter", true);
                        if (settings.marginTop < 80) update("marginTop", 115);
                        if (settings.marginBottom < 50) update("marginBottom", 75);
                      }}
                      className="mt-0.5 size-4 accent-primary"
                    />
                    <div>
                      <p className="text-xs font-medium text-foreground">Print on Pre-Printed Stationery</p>
                      <p className="text-[11px] text-muted-foreground">
                        Hides digital logo and company details so document body prints cleanly on physical office paper already embossed with your letterhead.
                      </p>
                    </div>
                  </label>

                  <label
                    className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-all ${
                      settings.letterheadMode === "background"
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-surface-muted/40"
                    }`}
                  >
                    <input
                      type="radio"
                      name="letterheadMode"
                      checked={settings.letterheadMode === "background"}
                      onChange={() => update("letterheadMode", "background")}
                      className="mt-0.5 size-4 accent-primary"
                    />
                    <div>
                      <p className="text-xs font-medium text-foreground">Full-Page Background Letterhead Artwork</p>
                      <p className="text-[11px] text-muted-foreground">
                        Upload a high-resolution A4 image of your official letterhead to act as the full backdrop for every page.
                      </p>
                    </div>
                  </label>
                </div>

                {settings.letterheadMode === "background" && (
                  <div className="mt-4 space-y-2 rounded-lg border border-border/80 bg-surface-muted/30 p-3">
                    <Label htmlFor="letterheadBackgroundUrl" className="text-xs font-semibold">
                      Upload A4 Letterhead Background (PNG/JPG)
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        id="letterheadBackgroundUrl"
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload("letterheadBackgroundUrl")}
                        className="text-xs"
                      />
                      {settings.letterheadBackgroundUrl && (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => update("letterheadBackgroundUrl", null)}
                        >
                          Clear
                        </Button>
                      )}
                    </div>
                    {settings.letterheadBackgroundUrl && (
                      <p className="text-[11px] text-emerald-600 dark:text-emerald-400">
                        ✓ Background letterhead loaded and active.
                      </p>
                    )}
                  </div>
                )}
              </section>

              {/* Page Margins / Safe Content Bounds */}
              <section className="rounded-xl border border-border bg-surface p-4 shadow-2xs">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Sliders className="size-4 text-primary" />
                  Print Margins & Padding (Safe Printable Area)
                </h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Adjust top and bottom spacing so text starts safely below your physical or background letterhead.
                </p>

                <div className="mt-4 grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <Label className="text-xs">Top Margin</Label>
                      <span className="text-[11px] font-mono text-muted-foreground">{settings.marginTop ?? 40}pt ({Math.round(((settings.marginTop ?? 40) / 2.83))}mm)</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={220}
                      step={5}
                      value={settings.marginTop ?? 40}
                      onChange={(e) => update("marginTop", Number(e.target.value))}
                      className="w-full accent-primary cursor-pointer"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <Label className="text-xs">Bottom Margin</Label>
                      <span className="text-[11px] font-mono text-muted-foreground">{settings.marginBottom ?? 40}pt ({Math.round(((settings.marginBottom ?? 40) / 2.83))}mm)</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={180}
                      step={5}
                      value={settings.marginBottom ?? 40}
                      onChange={(e) => update("marginBottom", Number(e.target.value))}
                      className="w-full accent-primary cursor-pointer"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <Label className="text-xs">Left Margin</Label>
                      <span className="text-[11px] font-mono text-muted-foreground">{settings.marginLeft ?? 40}pt</span>
                    </div>
                    <input
                      type="range"
                      min={10}
                      max={90}
                      step={5}
                      value={settings.marginLeft ?? 40}
                      onChange={(e) => update("marginLeft", Number(e.target.value))}
                      className="w-full accent-primary cursor-pointer"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <Label className="text-xs">Right Margin</Label>
                      <span className="text-[11px] font-mono text-muted-foreground">{settings.marginRight ?? 40}pt</span>
                    </div>
                    <input
                      type="range"
                      min={10}
                      max={90}
                      step={5}
                      value={settings.marginRight ?? 40}
                      onChange={(e) => update("marginRight", Number(e.target.value))}
                      className="w-full accent-primary cursor-pointer"
                    />
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-border grid grid-cols-2 gap-3">
                  <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.hideDigitalHeader ?? false}
                      onChange={(e) => update("hideDigitalHeader", e.target.checked)}
                      className="size-4 rounded accent-primary"
                    />
                    Hide Digital Company Header
                  </label>

                  <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.hideDigitalFooter ?? false}
                      onChange={(e) => update("hideDigitalFooter", e.target.checked)}
                      className="size-4 rounded accent-primary"
                    />
                    Hide Digital Footer Banner
                  </label>
                </div>
              </section>
            </div>
          )}

          {/* TAB 2: STYLE & COLORS */}
          {activeTab === "style" && (
            <div className="space-y-6">
              <section className="rounded-xl border border-border bg-surface p-4 shadow-2xs">
                <h3 className="text-sm font-semibold text-foreground">Template Engine</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">Select layout geometry and rendering structure.</p>

                <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(["modern", "classic", "minimal", "custom-html"] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => update("templateType", type)}
                      className={`flex flex-col items-center justify-center rounded-lg border p-3 text-center transition-all ${
                        settings.templateType === type
                          ? "border-primary bg-primary/10 text-primary font-semibold shadow-xs"
                          : "border-border text-muted-foreground hover:bg-surface-muted hover:text-foreground"
                      }`}
                    >
                      <span className="text-xs capitalize">{type}</span>
                      <span className="text-[10px] text-muted-foreground font-normal">
                        {type === "modern" && "Clean & bold"}
                        {type === "classic" && "Formal box"}
                        {type === "minimal" && "High-density"}
                        {type === "custom-html" && "Full Code"}
                      </span>
                    </button>
                  ))}
                </div>
              </section>

              {settings.templateType !== "custom-html" && (
                <section className="rounded-xl border border-border bg-surface p-4 shadow-2xs">
                  <h3 className="text-sm font-semibold text-foreground">Color Palette & Brand Accents</h3>
                  <div className="mt-3 space-y-3">
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={settings.primaryColor}
                        onChange={(e) => update("primaryColor", e.target.value)}
                        className="size-10 cursor-pointer rounded-lg border border-border bg-transparent p-0.5"
                      />
                      <div className="flex-1">
                        <Label htmlFor="primaryColor" className="text-xs">Primary Brand Color</Label>
                        <Input
                          id="primaryColor"
                          value={settings.primaryColor}
                          onChange={(e) => update("primaryColor", e.target.value)}
                          placeholder="#1e3a8a"
                          className="mt-1 font-mono text-xs"
                        />
                      </div>
                    </div>

                    <div>
                      <span className="text-xs text-muted-foreground">Color Presets</span>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {COLOR_PRESETS.map((preset) => (
                          <button
                            key={preset.color}
                            type="button"
                            onClick={() => update("primaryColor", preset.color)}
                            className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-2 py-1 text-xs hover:border-primary transition-colors"
                          >
                            <span className="size-3 rounded-full" style={{ backgroundColor: preset.color }} />
                            {preset.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </section>
              )}

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

          {/* TAB 3: LOGO & BRANDING */}
          {activeTab === "branding" && (
            <div className="space-y-6">
              <section className="rounded-xl border border-border bg-surface p-4 shadow-2xs">
                <h3 className="text-sm font-semibold text-foreground">Company Logo</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">Upload a high-resolution brand logo.</p>

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

              <section className="rounded-xl border border-border bg-surface p-4 shadow-2xs">
                <h3 className="text-sm font-semibold text-foreground">Header & Footer Banner Graphics</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">Full-width graphics placed above or below document body.</p>

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

              <section className="rounded-xl border border-border bg-surface p-4 shadow-2xs">
                <h3 className="text-sm font-semibold text-foreground">Taglines & Messages</h3>
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

          {/* TAB 4: LABELS & WORDING */}
          {activeTab === "labels" && (
            <div className="space-y-6">
              <section className="rounded-xl border border-border bg-surface p-4 shadow-2xs">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Type className="size-4 text-primary" />
                  Custom Document Title & Headers
                </h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Override standard document wording without editing HTML or templates.
                </p>

                <div className="mt-3 space-y-3">
                  <div className="space-y-1">
                    <Label htmlFor="customDocumentTitle" className="text-xs">Document Title (e.g. TAX INVOICE)</Label>
                    <Input
                      id="customDocumentTitle"
                      value={settings.customDocumentTitle ?? ""}
                      onChange={(e) => update("customDocumentTitle", e.target.value)}
                      placeholder="Leave blank to use default (e.g. INVOICE)"
                      className="text-xs"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="customPartyLabel" className="text-xs">Party / Customer Label (e.g. BILL TO, CLIENT)</Label>
                    <Input
                      id="customPartyLabel"
                      value={settings.customPartyLabel ?? ""}
                      onChange={(e) => update("customPartyLabel", e.target.value)}
                      placeholder="Leave blank to use default (e.g. BILL TO)"
                      className="text-xs"
                    />
                  </div>
                </div>
              </section>

              <section className="rounded-xl border border-border bg-surface p-4 shadow-2xs">
                <h3 className="text-sm font-semibold text-foreground">Table Column Header Renaming</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Rename table columns to suit your business (e.g. Hours instead of Qty, Rate instead of Unit Price).
                </p>

                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Description Column</Label>
                    <Input
                      value={settings.customDescriptionLabel ?? ""}
                      onChange={(e) => update("customDescriptionLabel", e.target.value)}
                      placeholder="Description"
                      className="text-xs"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Quantity Column</Label>
                    <Input
                      value={settings.customQuantityLabel ?? ""}
                      onChange={(e) => update("customQuantityLabel", e.target.value)}
                      placeholder="Qty / Hours"
                      className="text-xs"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Unit Price Column</Label>
                    <Input
                      value={settings.customUnitPriceLabel ?? ""}
                      onChange={(e) => update("customUnitPriceLabel", e.target.value)}
                      placeholder="Unit Price / Rate"
                      className="text-xs"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Tax Column</Label>
                    <Input
                      value={settings.customTaxLabel ?? ""}
                      onChange={(e) => update("customTaxLabel", e.target.value)}
                      placeholder="Tax / VAT"
                      className="text-xs"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Discount Column</Label>
                    <Input
                      value={settings.customDiscountLabel ?? ""}
                      onChange={(e) => update("customDiscountLabel", e.target.value)}
                      placeholder="Discount"
                      className="text-xs"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Line Total Column</Label>
                    <Input
                      value={settings.customAmountLabel ?? ""}
                      onChange={(e) => update("customAmountLabel", e.target.value)}
                      placeholder="Amount / Total"
                      className="text-xs"
                    />
                  </div>

                  <div className="space-y-1 col-span-2">
                    <Label className="text-xs">Final Total Label</Label>
                    <Input
                      value={settings.customTotalLabel ?? ""}
                      onChange={(e) => update("customTotalLabel", e.target.value)}
                      placeholder="Total / Net Payable"
                      className="text-xs"
                    />
                  </div>
                </div>
              </section>
            </div>
          )}

          {/* TAB 5: BANK & SIGNATURES */}
          {activeTab === "bank" && (
            <div className="space-y-6">
              <section className="rounded-xl border border-border bg-surface p-4 shadow-2xs">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <CreditCard className="size-4 text-primary" />
                    Structured Bank Details & Remittance
                  </h3>
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.showPaymentInstructions}
                      onChange={(e) => update("showPaymentInstructions", e.target.checked)}
                      className="size-4 rounded accent-primary"
                    />
                    Enable
                  </label>
                </div>

                {settings.showPaymentInstructions && (
                  <div className="mt-3 space-y-3 pt-3 border-t border-border">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Bank Name</Label>
                        <Input
                          value={settings.bankName ?? ""}
                          onChange={(e) => update("bankName", e.target.value)}
                          placeholder="e.g. Emirates NBD"
                          className="text-xs"
                        />
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs">Account Name</Label>
                        <Input
                          value={settings.bankAccountName ?? ""}
                          onChange={(e) => update("bankAccountName", e.target.value)}
                          placeholder="e.g. Acme Corp LLC"
                          className="text-xs"
                        />
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs">Account Number</Label>
                        <Input
                          value={settings.bankAccountNumber ?? ""}
                          onChange={(e) => update("bankAccountNumber", e.target.value)}
                          placeholder="1234567890"
                          className="text-xs"
                        />
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs">SWIFT / BIC Code</Label>
                        <Input
                          value={settings.bankSwiftBic ?? ""}
                          onChange={(e) => update("bankSwiftBic", e.target.value)}
                          placeholder="EBILAEADXXX"
                          className="text-xs"
                        />
                      </div>

                      <div className="space-y-1 col-span-2">
                        <Label className="text-xs">IBAN</Label>
                        <Input
                          value={settings.bankIban ?? ""}
                          onChange={(e) => update("bankIban", e.target.value)}
                          placeholder="AE070331234567890123456"
                          className="text-xs font-mono"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor="paymentInstructions" className="text-xs">Additional Remittance Notes / Terms</Label>
                      <textarea
                        id="paymentInstructions"
                        rows={2}
                        value={settings.paymentInstructions ?? ""}
                        onChange={(e) => update("paymentInstructions", e.target.value)}
                        placeholder="Please quote invoice number on transfer reference."
                        className="w-full rounded-md border border-border bg-surface px-3 py-2 text-xs"
                      />
                    </div>
                  </div>
                )}
              </section>

              <section className="rounded-xl border border-border bg-surface p-4 shadow-2xs">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <PenTool className="size-4 text-primary" />
                    Signature & Company Stamp Block
                  </h3>
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.showSignatureBlock}
                      onChange={(e) => update("showSignatureBlock", e.target.checked)}
                      className="size-4 rounded accent-primary"
                    />
                    Enable
                  </label>
                </div>

                {settings.showSignatureBlock && (
                  <div className="mt-3 space-y-4 pt-3 border-t border-border">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Signature Layout</Label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => update("signatureLayout", "single")}
                          className={`flex-1 rounded-md border py-1.5 text-xs font-medium transition-colors ${
                            settings.signatureLayout === "single"
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border text-muted-foreground hover:bg-surface-muted"
                          }`}
                        >
                          Single Signatory
                        </button>
                        <button
                          type="button"
                          onClick={() => update("signatureLayout", "dual")}
                          className={`flex-1 rounded-md border py-1.5 text-xs font-medium transition-colors ${
                            settings.signatureLayout === "dual"
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border text-muted-foreground hover:bg-surface-muted"
                          }`}
                        >
                          Dual Signatories (Prepared By + Authorized By)
                        </button>
                      </div>
                    </div>

                    {settings.signatureLayout === "dual" && (
                      <div className="rounded-lg border border-border/80 bg-surface-muted/30 p-3 space-y-2">
                        <Label className="text-xs font-semibold">Left Signature: Prepared By / Checked By</Label>
                        <Input
                          value={settings.secondarySignatureLabel ?? "Prepared By"}
                          onChange={(e) => update("secondarySignatureLabel", e.target.value)}
                          placeholder="Prepared By"
                          className="text-xs"
                        />
                        <div className="flex gap-2">
                          <Input
                            type="file"
                            accept="image/*"
                            onChange={handleImageUpload("secondarySignatureImageUrl")}
                            className="text-xs"
                          />
                          {settings.secondarySignatureImageUrl && (
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() => update("secondarySignatureImageUrl", null)}
                            >
                              Clear
                            </Button>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="rounded-lg border border-border/80 bg-surface-muted/30 p-3 space-y-2">
                      <Label className="text-xs font-semibold">
                        {settings.signatureLayout === "dual" ? "Right Signature: Authorized Signatory" : "Authorized Signatory"}
                      </Label>
                      <Input
                        value={settings.signatureLabel ?? "Authorized Signatory"}
                        onChange={(e) => update("signatureLabel", e.target.value)}
                        placeholder="Authorized Signatory"
                        className="text-xs"
                      />
                      <div className="flex gap-2">
                        <Input
                          type="file"
                          accept="image/*"
                          onChange={handleImageUpload("signatureImageUrl")}
                          className="text-xs"
                        />
                        {settings.signatureImageUrl && (
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => update("signatureImageUrl", null)}
                          >
                            Clear
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </section>
            </div>
          )}

          {/* TAB 6: COLUMNS & BLOCKS */}
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

              <section className="rounded-xl border border-border bg-surface p-4 shadow-2xs">
                <h3 className="text-sm font-semibold text-foreground">Watermark</h3>
                <div className="mt-3 space-y-3">
                  <div className="space-y-1">
                    <Label htmlFor="watermarkText" className="text-xs">Diagonal Watermark Text</Label>
                    <Input
                      id="watermarkText"
                      value={settings.watermarkText ?? ""}
                      onChange={(e) => update("watermarkText", e.target.value)}
                      placeholder="e.g. DRAFT, COPY, CONFIDENTIAL"
                      className="text-xs"
                    />
                  </div>

                  <div>
                    <span className="text-xs text-muted-foreground">Watermark Presets</span>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {WATERMARK_PRESETS.map((preset) => (
                        <button
                          key={preset || "none"}
                          type="button"
                          onClick={() => update("watermarkText", preset)}
                          className={`rounded-md border px-2 py-0.5 text-xs transition-colors ${
                            (settings.watermarkText ?? "") === preset
                              ? "border-primary bg-primary/10 text-primary font-medium"
                              : "border-border text-muted-foreground hover:bg-surface-muted hover:text-foreground"
                          }`}
                        >
                          {preset || "None"}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            </div>
          )}

          {/* TAB 7: CUSTOM HTML */}
          {activeTab === "custom-html" && settings.templateType === "custom-html" && (
            <div className="space-y-4">
              <section className="rounded-xl border border-border bg-surface p-4 shadow-2xs">
                <h3 className="text-sm font-semibold text-foreground">Custom Handlebars Template</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Click any variable badge below to copy it directly into your template code.
                </p>

                <div className="mt-2.5 flex flex-wrap gap-1.5 p-2 rounded-lg bg-surface-muted/40 border border-border">
                  {HTML_VARIABLES.map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => copyVariable(v)}
                      className="inline-flex items-center gap-1 rounded bg-surface border border-border px-1.5 py-0.5 text-[11px] font-mono text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                      title="Click to copy"
                    >
                      {copiedVar === v ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
                      {v}
                    </button>
                  ))}
                </div>

                <textarea
                  id="customHtml"
                  rows={16}
                  value={settings.customHtml ?? ""}
                  onChange={(e) => update("customHtml", e.target.value)}
                  placeholder="<!DOCTYPE html><html><body><h1>{{invoiceNumber}}</h1>...</body></html>"
                  className="mt-3 w-full rounded-md border border-border bg-neutral-950 p-3 font-mono text-xs text-emerald-400 focus:outline-hidden focus:ring-1 focus:ring-primary"
                />
              </section>
            </div>
          )}
        </div>

        {/* Right Column: Live PDF Canvas Preview (7 cols) */}
        <div className="lg:col-span-7 sticky top-6">
          <div className="rounded-xl border border-border bg-surface shadow-xs overflow-hidden">
            {/* Header Toolbar */}
            <div className="flex items-center justify-between border-b border-border bg-surface-muted/60 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Eye className="size-3.5 text-primary" />
                  Live Reactive Preview
                </span>
                {previewLoading ? (
                  <span className="inline-flex items-center gap-1 text-[11px] text-primary font-medium animate-pulse">
                    <LoaderCircle className="size-3 animate-spin" /> Compiling...
                  </span>
                ) : (
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">● Live</span>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                {/* Zoom Preset Toggles */}
                <div className="flex items-center rounded-md border border-border bg-surface p-0.5 mr-1">
                  <button
                    type="button"
                    onClick={() => setZoomHeight(560)}
                    className={`px-1.5 py-0.5 text-[10px] rounded transition-colors ${
                      zoomHeight === 560 ? "bg-primary text-primary-foreground font-semibold" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    50%
                  </button>
                  <button
                    type="button"
                    onClick={() => setZoomHeight(720)}
                    className={`px-1.5 py-0.5 text-[10px] rounded transition-colors ${
                      zoomHeight === 720 ? "bg-primary text-primary-foreground font-semibold" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Fit
                  </button>
                  <button
                    type="button"
                    onClick={() => setZoomHeight(960)}
                    className={`px-1.5 py-0.5 text-[10px] rounded transition-colors ${
                      zoomHeight === 960 ? "bg-primary text-primary-foreground font-semibold" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    100%
                  </button>
                </div>

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
            <div
              className="relative w-full bg-neutral-100 dark:bg-neutral-900 flex flex-col items-center justify-center transition-all duration-200"
              style={{ minHeight: `${zoomHeight}px` }}
            >
              {previewLoading && !blobUrl && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-surface/85 backdrop-blur-xs">
                  <LoaderCircle className="size-8 animate-spin text-primary" />
                  <p className="mt-3 text-sm font-medium text-foreground">Compiling PDF preview...</p>
                  <p className="text-xs text-muted-foreground">Applying template layout & typography</p>
                </div>
              )}

              {pdfError ? (
                <div className="flex flex-col items-center justify-center p-8 text-center">
                  <div className="rounded-full bg-danger/10 p-3 text-danger mb-3">
                    <FileText className="size-6" />
                  </div>
                  <h4 className="text-sm font-semibold text-foreground">Preview Rendering Notice</h4>
                  <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                    {pdfError}. You can open the PDF directly in a new tab or retry rendering.
                  </p>
                  <div className="mt-4 flex gap-2">
                    <Button variant="secondary" size="sm" onClick={() => setRefreshKey(Date.now())}>
                      <RotateCcw className="size-3.5 mr-1" /> Retry
                    </Button>
                    <Button asChild size="sm">
                      <a href={previewUrl} target="_blank" rel="noreferrer">
                        <ExternalLink className="size-3.5 mr-1" /> Open in New Tab
                      </a>
                    </Button>
                  </div>
                </div>
              ) : blobUrl ? (
                <object
                  data={blobUrl}
                  type="application/pdf"
                  className="w-full transition-all duration-200"
                  style={{ height: `${zoomHeight}px` }}
                  title={`${typeLabel} Live PDF Preview`}
                >
                  <iframe
                    src={blobUrl}
                    className="w-full border-0 transition-all duration-200"
                    style={{ height: `${zoomHeight}px` }}
                    title={`${typeLabel} Live PDF Preview`}
                  >
                    <div className="p-8 text-center">
                      <p className="text-sm text-muted-foreground">PDF preview not supported directly in this frame.</p>
                      <a
                        href={blobUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 text-primary hover:underline text-xs inline-block"
                      >
                        Click here to open PDF
                      </a>
                    </div>
                  </iframe>
                </object>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
