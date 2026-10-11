"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LoaderCircle, RotateCcw, Save, Variable, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormError } from "@/components/form-error";
import {
  type EmailTemplate,
  SUPPORTED_TEMPLATE_TYPES,
  TEMPLATE_VARIABLES,
  DEFAULT_TEMPLATES,
  interpolateEmailTemplate,
} from "../email-template-service";
import { saveEmailTemplateAction, resetEmailTemplateAction } from "../actions";

const SAMPLE_DATA: Record<string, string> = {
  customerName: "Acme Industrial Supplies LLC",
  documentNumber: "INV-2026-088",
  businessName: "Gulf Apex Trading Ltd",
  total: "AED 12,450.00",
  balance: "AED 12,450.00",
  documentDate: "15 Oct 2026",
  dueDate: "14 Nov 2026",
  currency: "AED",
};

export function EmailTemplateManager({
  businessId,
  initialTemplates,
}: {
  businessId: string;
  initialTemplates: EmailTemplate[];
}) {
  const router = useRouter();
  const [selectedType, setSelectedType] = useState<string>("sales-invoice");

  // Map of template_type -> { subject, body }
  const [templatesState, setTemplatesState] = useState<Record<string, { subject: string; body: string }>>(() => {
    const map: Record<string, { subject: string; body: string }> = {};
    for (const def of SUPPORTED_TEMPLATE_TYPES) {
      const found = initialTemplates.find(
        (t) => t.document_type === def.type || t.document_type === def.type.replace(/-/g, "_")
      );
      if (found) {
        map[def.type] = { subject: found.subject, body: found.body };
      } else {
        const fallback = DEFAULT_TEMPLATES[def.type] || {
          subject: `${def.name} {{document_number}} from {{business_name}}`,
          body: `Hello {{customer_name}},\n\nPlease find ${def.name} {{document_number}} attached.\n\nBest regards,\n{{business_name}}`,
        };
        map[def.type] = fallback;
      }
    }
    return map;
  });

  const [activeFocusField, setActiveFocusField] = useState<"subject" | "body">("body");
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState("");

  const currentTemplate = templatesState[selectedType] || { subject: "", body: "" };
  const currentDef = SUPPORTED_TEMPLATE_TYPES.find((t) => t.type === selectedType);

  const sampleInterpolation = interpolateEmailTemplate(currentTemplate, SAMPLE_DATA);

  function handleSubjectChange(value: string) {
    setTemplatesState((prev) => ({
      ...prev,
      [selectedType]: { ...prev[selectedType], subject: value },
    }));
  }

  function handleBodyChange(value: string) {
    setTemplatesState((prev) => ({
      ...prev,
      [selectedType]: { ...prev[selectedType], body: value },
    }));
  }

  function insertVariable(variableKey: string) {
    if (activeFocusField === "subject") {
      handleSubjectChange(currentTemplate.subject + " " + variableKey);
    } else {
      handleBodyChange(currentTemplate.body + " " + variableKey);
    }
    toast.info(`Inserted ${variableKey}`);
  }

  async function handleSave() {
    if (!currentTemplate.subject.trim()) {
      setError("Subject line cannot be blank.");
      return;
    }
    if (!currentTemplate.body.trim()) {
      setError("Email body cannot be blank.");
      return;
    }

    setSaving(true);
    setError("");
    const res = await saveEmailTemplateAction(
      businessId,
      selectedType,
      currentTemplate.subject,
      currentTemplate.body
    );
    setSaving(false);

    if (res.error) {
      setError(res.error);
      return;
    }

    toast.success(`Template saved for ${currentDef?.name || selectedType}`);
    router.refresh();
  }

  async function handleReset() {
    if (!confirm(`Reset template for "${currentDef?.name}" to factory default?`)) return;
    setResetting(true);
    setError("");
    const res = await resetEmailTemplateAction(businessId, selectedType);
    setResetting(false);

    if (res.error) {
      setError(res.error);
      return;
    }

    const fallback = DEFAULT_TEMPLATES[selectedType];
    if (fallback) {
      setTemplatesState((prev) => ({
        ...prev,
        [selectedType]: fallback,
      }));
    }

    toast.success("Template reset to factory default.");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {/* Template Type Selector */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
        {SUPPORTED_TEMPLATE_TYPES.map((t) => (
          <button
            key={t.type}
            type="button"
            onClick={() => {
              setSelectedType(t.type);
              setError("");
            }}
            className={`rounded-md px-3 py-1.5 text-xs sm:text-sm font-medium transition-colors ${
              selectedType === t.type
                ? "bg-primary text-primary-foreground shadow-xs"
                : "bg-surface text-muted-foreground hover:bg-surface-muted hover:text-foreground"
            }`}
          >
            {t.name}
          </button>
        ))}
      </div>

      {error && <FormError message={error} />}

      <div className="grid items-start gap-8 lg:grid-cols-12">
        {/* Left Column: Template Editor (7 cols) */}
        <div className="space-y-5 lg:col-span-7">
          <div className="rounded-xl border border-border bg-surface p-5 shadow-xs space-y-4">
            <div>
              <h3 className="text-base font-semibold text-foreground">{currentDef?.name} Email Template</h3>
              <p className="text-xs text-muted-foreground">{currentDef?.description}</p>
            </div>

            {/* Variable Insertion Dock */}
            <div className="rounded-lg border border-border bg-surface-muted/40 p-3 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Variable className="size-3.5 text-primary" />
                <span>Available Dynamic Tokens (click to insert into {activeFocusField}):</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {TEMPLATE_VARIABLES.map((v) => (
                  <button
                    key={v.key}
                    type="button"
                    onClick={() => insertVariable(v.key)}
                    className="inline-flex items-center gap-1 rounded border border-border bg-surface px-2 py-0.5 text-[11px] font-mono font-medium text-foreground hover:border-primary hover:text-primary transition-colors"
                    title={`${v.label} (e.g. ${v.example})`}
                  >
                    <span>{v.key}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="subject">Email Subject</Label>
              <Input
                id="subject"
                value={currentTemplate.subject}
                onChange={(e) => handleSubjectChange(e.target.value)}
                onFocus={() => setActiveFocusField("subject")}
                placeholder="Subject line with {{document_number}}, etc."
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="body">Email Message Body</Label>
              <Textarea
                id="body"
                rows={10}
                value={currentTemplate.body}
                onChange={(e) => handleBodyChange(e.target.value)}
                onFocus={() => setActiveFocusField("body")}
                placeholder="Write your email message using dynamic variables..."
                className="font-mono text-xs leading-relaxed"
              />
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-border">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReset}
                disabled={resetting || saving}
                className="text-muted-foreground hover:text-danger gap-1 text-xs"
              >
                <RotateCcw className="size-3.5" /> Reset to Default
              </Button>

              <Button onClick={handleSave} disabled={saving || resetting} className="gap-1.5">
                {saving ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}
                Save Template
              </Button>
            </div>
          </div>
        </div>

        {/* Right Column: Live Sample Preview (5 cols) */}
        <div className="lg:col-span-5">
          <div className="sticky top-6 rounded-xl border border-border bg-surface shadow-xs overflow-hidden">
            <div className="flex items-center justify-between border-b border-border bg-surface-muted/30 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <Eye className="size-3.5 text-primary" />
                <span className="text-xs font-semibold text-foreground">Live Sample Preview</span>
              </div>
              <span className="text-[11px] text-muted-foreground">Sample Data Interpolated</span>
            </div>

            <div className="p-4 space-y-4">
              <div>
                <span className="text-[10px] uppercase font-semibold text-muted-foreground block mb-0.5">
                  Subject Line:
                </span>
                <div className="rounded-md border border-border bg-surface-muted/30 p-2.5 text-xs font-semibold text-foreground">
                  {sampleInterpolation.subject || "(Empty subject)"}
                </div>
              </div>

              <div>
                <span className="text-[10px] uppercase font-semibold text-muted-foreground block mb-0.5">
                  Message Body:
                </span>
                <div className="rounded-md border border-border bg-surface-muted/20 p-3.5 text-xs text-foreground whitespace-pre-wrap leading-relaxed min-h-[220px]">
                  {sampleInterpolation.body || "(Empty body)"}
                </div>
              </div>

              <div className="rounded-lg bg-surface-muted/50 p-2.5 text-[11px] text-muted-foreground border border-border/50">
                Note: In production sends, attached PDF documents (e.g. {SAMPLE_DATA.documentNumber}.pdf) are attached directly to outbound messages.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
