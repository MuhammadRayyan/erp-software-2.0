"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { saveFormDefaultsAction } from "@/modules/form-defaults/actions";
import type { FormDefaultValues } from "@/modules/form-defaults/form-defaults-service";

function Toggle({
  id,
  label,
  description,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <Label htmlFor={id} className="text-sm font-medium">{label}</Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <button
        type="button"
        id={id}
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-transparent transition-colors ${checked ? "bg-primary" : "bg-muted"}`}
      >
        <span className={`inline-block size-4 transform rounded-full bg-white shadow transition-transform ${checked ? "translate-x-4" : "translate-x-0.5"}`} />
      </button>
    </div>
  );
}

export function FormDefaultsEditor({
  businessId,
  formType,
  initial,
}: {
  businessId: string;
  formType: string;
  initial: FormDefaultValues;
}) {
  const router = useRouter();
  const [amountsIncludeTax, setAmountsIncludeTax] = useState(initial.amountsIncludeTax ?? false);
  const [showDiscounts, setShowDiscounts] = useState(initial.showDiscounts ?? false);
  const [showLineNumber, setShowLineNumber] = useState(initial.showLineNumber ?? false);
  const [showDescription, setShowDescription] = useState(initial.showDescription ?? true);
  const [defaultNotes, setDefaultNotes] = useState(initial.defaultNotes ?? "");
  const [defaultTerms, setDefaultTerms] = useState(initial.defaultTerms ?? "");
  const [saving, setSaving] = useState(false);

  const onSave = async () => {
    setSaving(true);
    try {
      await saveFormDefaultsAction(businessId, formType, {
        amountsIncludeTax,
        showDiscounts,
        showLineNumber,
        showDescription,
        defaultNotes,
        defaultTerms,
      });
      toast.success("Form defaults saved.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save form defaults.");
    } finally {
      setSaving(false);
    }
  };


  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold">Line defaults</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          These toggles pre-set the form when creating a new document of this type. They can still be changed per-document.
        </p>
        <div className="mt-4 space-y-4">
          <Toggle
            id="amountsIncludeTax"
            label="Amounts include tax"
            description="Line prices are entered VAT-inclusive (tax is backed out)."
            checked={amountsIncludeTax}
            onChange={setAmountsIncludeTax}
          />
          <Toggle
            id="showDiscounts"
            label="Show discount column"
            description="Display a per-line discount input on the form."
            checked={showDiscounts}
            onChange={setShowDiscounts}
          />
          <Toggle
            id="showLineNumber"
            label="Show line numbers"
            description="Display a sequential line-number column."
            checked={showLineNumber}
            onChange={setShowLineNumber}
          />
          <Toggle
            id="showDescription"
            label="Show description column"
            description="Display a per-line description input."
            checked={showDescription}
            onChange={setShowDescription}
          />
        </div>
      </div>

      <div className="rounded-lg border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold">Document text</h2>
        <div className="mt-4 space-y-4">
          <div>
            <Label htmlFor="defaultNotes" className="text-sm font-medium">Default notes</Label>
            <p className="text-xs text-muted-foreground">Pre-filled in the Notes field on new documents.</p>
            <textarea
              id="defaultNotes"
              value={defaultNotes}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setDefaultNotes(e.target.value)}
              rows={3}
              className="mt-1.5 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="e.g. Thank you for your business."
            />
          </div>
          <div>
            <Label htmlFor="defaultTerms" className="text-sm font-medium">Default terms</Label>
            <p className="text-xs text-muted-foreground">Pre-filled in the Terms field on new documents.</p>
            <textarea
              id="defaultTerms"
              value={defaultTerms}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setDefaultTerms(e.target.value)}
              rows={3}
              className="mt-1.5 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="e.g. Payment due within 30 days."
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => router.back()}>Cancel</Button>
        <Button onClick={onSave} disabled={saving}>
          {saving ? "Saving…" : "Save defaults"}
        </Button>
      </div>
    </div>
  );
}
