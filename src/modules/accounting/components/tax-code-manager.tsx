"use client";

import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DialogContent, DialogDescription, DialogRoot, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { rateBasisPointsToPercent } from "../calculations/money";
import { saveTaxCodeAction } from "../actions";
import type { TaxCodeInput } from "../tax-code-input";
import { taxDirectionLabels, vatCategoryLabels, type TaxDirection, type VatCategory } from "@/modules/tax/uae-vat-config";
import { FormError } from "@/components/form-error";
import { SelectNative } from "@/components/ui/select-native";

type TaxCodeRow = {
  id: string;
  name: string;
  rateBasisPoints: number;
  direction: TaxDirection;
  vatCategory: VatCategory | null;
  salesTaxAccountId: string | null;
  purchaseTaxAccountId: string | null;
  isRecoverable: boolean;
  isActive: boolean;
};


export function TaxCodeManager({
  businessId,
  taxCodes,
  liabilityAccounts,
  assetAccounts,
}: {
  businessId: string;
  taxCodes: TaxCodeRow[];
  liabilityAccounts: { id: string; code: string; name: string }[];
  assetAccounts: { id: string; code: string; name: string }[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<TaxCodeRow | null | undefined>(undefined);
  const [values, setValues] = useState<TaxCodeInput>({ name: "", rate: "0", direction: "both", vatCategory: "out_of_scope", salesTaxAccountId: "", purchaseTaxAccountId: "", isRecoverable: false, isActive: true });
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [serverError, setServerError] = useState("");
  const [pending, setPending] = useState(false);

  function open(code?: TaxCodeRow) {
    setEditing(code ?? null);
    setValues(code ? {
      name: code.name,
      rate: rateBasisPointsToPercent(code.rateBasisPoints),
      direction: code.direction,
      vatCategory: code.vatCategory ?? "out_of_scope",
      salesTaxAccountId: code.salesTaxAccountId ?? "",
      purchaseTaxAccountId: code.purchaseTaxAccountId ?? "",
      isRecoverable: code.isRecoverable,
      isActive: code.isActive,
    } : { name: "", rate: "0", direction: "both", vatCategory: "out_of_scope", salesTaxAccountId: "", purchaseTaxAccountId: "", isRecoverable: false, isActive: true });
    setErrors({});
    setServerError("");
  }

  async function save() {
    setPending(true);
    const result = await saveTaxCodeAction(businessId, editing?.id ?? null, values);
    setPending(false);
    setErrors(result.fieldErrors ?? {});
    if (result.error) return setServerError(result.error);
    setEditing(undefined);
    toast.success(editing ? "Tax code updated." : "Tax code created.");
    router.refresh();
  }

  return (
    <>
      <div className="mb-4 flex justify-end"><Button onClick={() => open()}><Plus className="size-4" /> New Tax Code</Button></div>
      <div className="data-panel overflow-x-auto">
        <table className="data-table min-w-[980px]">
          <thead><tr><th>Tax code</th><th className="text-right!">Rate</th><th>Direction</th><th>VAT category</th><th>Recoverable</th><th>Sales tax account</th><th>Purchase tax account</th><th>Status</th><th className="w-20"><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>{taxCodes.map((code) => {
            const account = liabilityAccounts.find((item) => item.id === code.salesTaxAccountId);
            const purchaseAccount = assetAccounts.find((item) => item.id === code.purchaseTaxAccountId);
            return <tr key={code.id}><td className="font-medium">{code.name}</td><td className="money text-right">{rateBasisPointsToPercent(code.rateBasisPoints)}%</td><td>{taxDirectionLabels[code.direction]}</td><td>{code.vatCategory ? vatCategoryLabels[code.vatCategory] : <Badge tone="warning">Needs review</Badge>}</td><td>{code.isRecoverable ? "Yes" : "No"}</td><td className="text-muted-foreground">{account ? `${account.code} ${account.name}` : "Not required"}</td><td className="text-muted-foreground">{purchaseAccount ? `${purchaseAccount.code} ${purchaseAccount.name}` : "Not required"}</td><td><Badge tone={code.isActive ? "success" : "neutral"}>{code.isActive ? "Active" : "Inactive"}</Badge></td><td><Button variant="ghost" size="sm" onClick={() => open(code)}><Pencil className="size-3.5" /> Edit</Button></td></tr>;
          })}</tbody>
        </table>
      </div>
      <DialogRoot open={editing !== undefined} onOpenChange={(isOpen) => !isOpen && setEditing(undefined)}>
        <DialogContent>
          <DialogTitle>{editing ? "Edit tax code" : "New tax code"}</DialogTitle>
          <DialogDescription>Classification is preserved on posted tax entries. Changing a used code affects future postings only.</DialogDescription>
          <div className="mt-5 space-y-4">
            <div className="space-y-1.5"><Label htmlFor="tax-name">Name</Label><Input id="tax-name" value={values.name} onChange={(event) => setValues((current) => ({ ...current, name: event.target.value }))} aria-invalid={!!errors.name} />{errors.name && <p className="field-error">{errors.name[0]}</p>}</div>
            <div className="space-y-1.5"><Label htmlFor="tax-rate">Rate %</Label><Input id="tax-rate" type="number" min="0" max="100" step="0.01" value={values.rate} onChange={(event) => setValues((current) => ({ ...current, rate: event.target.value }))} aria-invalid={!!errors.rate} />{errors.rate && <p className="field-error">{errors.rate[0]}</p>}</div>
            <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-1.5"><Label htmlFor="tax-direction">Direction</Label><SelectNative id="tax-direction"  value={values.direction} onChange={(event) => setValues((current) => ({ ...current, direction: event.target.value as TaxDirection }))}><option value="sales">Sales</option><option value="purchases">Purchases</option><option value="both">Both</option></SelectNative></div><div className="space-y-1.5"><Label htmlFor="vat-category">VAT category</Label><SelectNative id="vat-category"  value={values.vatCategory} onChange={(event) => setValues((current) => ({ ...current, vatCategory: event.target.value as VatCategory }))}><option value="standard">Standard</option><option value="zero_rated">Zero Rated</option><option value="exempt">Exempt</option><option value="out_of_scope">Out of Scope</option><option value="reverse_charge">Reverse Charge</option><option value="import">Import</option></SelectNative></div></div>
            <div className="space-y-1.5"><Label htmlFor="tax-account">Sales tax account</Label><SelectNative id="tax-account"  value={values.salesTaxAccountId} onChange={(event) => setValues((current) => ({ ...current, salesTaxAccountId: event.target.value }))}><option value="">Not required for 0%</option>{liabilityAccounts.map((account) => <option key={account.id} value={account.id}>{account.code} {account.name}</option>)}</SelectNative></div>
            <div className="space-y-1.5"><Label htmlFor="purchase-tax-account">Purchase tax account</Label><SelectNative id="purchase-tax-account"  value={values.purchaseTaxAccountId} onChange={(event) => setValues((current) => ({ ...current, purchaseTaxAccountId: event.target.value }))}><option value="">Not required for 0%</option>{assetAccounts.map((account) => <option key={account.id} value={account.id}>{account.code} {account.name}</option>)}</SelectNative></div>
            <label className="flex min-h-9 items-center gap-2 text-sm"><input type="checkbox" checked={values.isRecoverable} onChange={(event) => setValues((current) => ({ ...current, isRecoverable: event.target.checked }))} className="size-4 accent-[var(--primary)]" /> Recoverable Input VAT</label>
            <label className="flex min-h-9 items-center gap-2 text-sm"><input type="checkbox" checked={values.isActive} onChange={(event) => setValues((current) => ({ ...current, isActive: event.target.checked }))} className="size-4 accent-[var(--primary)]" /> Active tax code</label>
          </div>
          {serverError && <FormError message={serverError} />}
          <div className="mt-5 flex justify-end gap-2"><Button variant="ghost" onClick={() => setEditing(undefined)}>Cancel</Button><Button onClick={save} disabled={pending}>{editing ? "Save changes" : "Create tax code"}</Button></div>
        </DialogContent>
      </DialogRoot>
    </>
  );
}
