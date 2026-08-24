"use client";
import { FormError } from "@/components/form-error";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveTaxSettingsAction } from "./actions";
import type { TaxSettingsInput } from "./tax-settings-input";
import { emirateLabels, emirates, type Emirate } from "./uae-vat-config";
import { SelectNative } from "@/components/ui/select-native";


export function TaxSettingsForm({ businessId, initial, isAdmin }: { businessId: string; initial: TaxSettingsInput; isAdmin: boolean }) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  async function save() {
    setPending(true); setError("");
    const result = await saveTaxSettingsAction(businessId, values);
    setPending(false);
    if (result.error) return setError(result.error);
    toast.success("VAT registration settings saved."); router.refresh();
  }
  return <div className="space-y-6 max-w-4xl">
    {!isAdmin && <div className="rounded-md border border-info/25 bg-info/10 px-3 py-2 text-sm">Only a business Administrator can change VAT registration settings.</div>}
    <label className="flex items-center gap-3 rounded-lg border border-border bg-surface-raised p-4"><input type="checkbox" disabled={!isAdmin} checked={values.vatRegistered} onChange={(event) => setValues((current) => ({ ...current, vatRegistered: event.target.checked }))} className="size-4 accent-[var(--primary)]" /><span><span className="block font-medium">VAT registered</span><span className="block text-sm text-muted-foreground">Enables VAT-period working papers and standard-rated Sales validation.</span></span></label>
    <div className="grid gap-5 md:grid-cols-2">
      <div className="space-y-1.5"><Label htmlFor="trn">TRN</Label><Input id="trn" disabled={!isAdmin} value={values.trn ?? ""} onChange={(event) => setValues((current) => ({ ...current, trn: event.target.value }))} /></div>
      <div className="space-y-1.5"><Label htmlFor="default-emirate">Default supply Emirate</Label><SelectNative id="default-emirate" disabled={!isAdmin}  value={values.defaultSupplyEmirate ?? ""} onChange={(event) => setValues((current) => ({ ...current, defaultSupplyEmirate: event.target.value as Emirate }))}><option value="">Choose Emirate</option>{emirates.map((emirate) => <option key={emirate} value={emirate}>{emirateLabels[emirate]}</option>)}</SelectNative><p className="text-xs text-muted-foreground">Document-level review can override this default.</p></div>
      <div className="space-y-1.5"><Label htmlFor="effective-date">Registration effective date</Label><Input id="effective-date" type="date" disabled={!isAdmin} value={values.vatRegistrationEffectiveDate ?? ""} onChange={(event) => setValues((current) => ({ ...current, vatRegistrationEffectiveDate: event.target.value }))} /></div>
      <div className="space-y-1.5"><Label htmlFor="deregistration-date">Deregistration date <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="deregistration-date" type="date" disabled={!isAdmin} value={values.vatDeregistrationDate ?? ""} onChange={(event) => setValues((current) => ({ ...current, vatDeregistrationDate: event.target.value }))} /></div>
    </div>
    {error && <FormError message={error} />}
    {isAdmin && <div className="flex justify-end"><Button onClick={save} disabled={pending}>{pending ? "Saving…" : "Save VAT settings"}</Button></div>}
  </div>;
}

