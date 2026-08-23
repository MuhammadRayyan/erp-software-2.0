"use client";
import { FormError } from "@/components/form-error";

import { useState } from "react";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateInvoiceNumberingAction } from "../actions";
import type { InvoiceNumberingInput } from "../numbering-input";

export function NumberingForm({ businessId, initial }: { businessId: string; initial: InvoiceNumberingInput }) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [serverError, setServerError] = useState("");
  const [pending, setPending] = useState(false);

  async function save() {
    setPending(true);
    setServerError("");
    const result = await updateInvoiceNumberingAction(businessId, values);
    setPending(false);
    setErrors(result.fieldErrors ?? {});
    if (result.error) return setServerError(result.error);
    toast.success("Document numbering updated.");
  }

  const padding = Number(values.padding || 0);
  const sequences = [
    { label: "Sales Invoices", prefixKey: "prefix", nextKey: "nextNumber", paddingKey: "padding" },
    { label: "Sales Credit Notes", prefixKey: "creditNotePrefix", nextKey: "creditNoteNextNumber" },
    { label: "Purchase Orders", prefixKey: "purchaseOrderPrefix", nextKey: "purchaseOrderNextNumber" },
    { label: "Purchase Invoices", prefixKey: "purchaseInvoicePrefix", nextKey: "purchaseInvoiceNextNumber" },
    { label: "Supplier Payments", prefixKey: "supplierPaymentPrefix", nextKey: "supplierPaymentNextNumber" },
    { label: "Projects", prefixKey: "projectPrefix", nextKey: "projectNextNumber", paddingKey: "projectPadding" },
    { label: "Goods Receipts", prefixKey: "goodsReceiptPrefix", nextKey: "goodsReceiptNextNumber", paddingKey: "goodsReceiptPadding" },
    { label: "Delivery Notes", prefixKey: "deliveryNotePrefix", nextKey: "deliveryNoteNextNumber", paddingKey: "deliveryNotePadding" },
    { label: "Stock Adjustments", prefixKey: "stockAdjustmentPrefix", nextKey: "stockAdjustmentNextNumber", paddingKey: "stockAdjustmentPadding" },
    { label: "Bank Transactions", prefixKey: "bankTransactionPrefix", nextKey: "bankTransactionNextNumber", paddingKey: "bankTransactionPadding" },
    { label: "Bank Transfers", prefixKey: "bankTransferPrefix", nextKey: "bankTransferNextNumber", paddingKey: "bankTransferPadding" },
  ] as const;
  return (
    <div className="max-w-3xl">
      <p className="mb-5 text-sm text-muted-foreground">Numbers are allocated atomically by the server. Some sequences support custom padding.</p>
      <div className="space-y-5">
        {sequences.map((sequence) => {
          const prefix = String(values[sequence.prefixKey as keyof typeof values]);
          const next = Number(values[sequence.nextKey as keyof typeof values]);
          const pKey = ('paddingKey' in sequence ? sequence.paddingKey : undefined) as keyof InvoiceNumberingInput | undefined;
          const padValue = pKey ? Number(values[pKey] || 0) : 5;
          return <section key={sequence.label} className="border-b border-border pb-5"><h2 className="text-base font-semibold">{sequence.label}</h2><div className="mt-4 grid gap-4 sm:grid-cols-[1fr_1fr_auto_auto]"><div className="space-y-1.5"><Label htmlFor={sequence.prefixKey}>Prefix</Label><Input id={sequence.prefixKey} value={prefix} onChange={(event) => setValues((current) => ({ ...current, [sequence.prefixKey]: event.target.value }))} aria-invalid={!!errors[sequence.prefixKey]} />{errors[sequence.prefixKey] && <p className="field-error">{errors[sequence.prefixKey][0]}</p>}</div><div className="space-y-1.5"><Label htmlFor={sequence.nextKey}>Next number</Label><Input id={sequence.nextKey} type="number" min="1" value={next} onChange={(event) => setValues((current) => ({ ...current, [sequence.nextKey]: Number(event.target.value) }))} aria-invalid={!!errors[sequence.nextKey]} />{errors[sequence.nextKey] && <p className="field-error">{errors[sequence.nextKey][0]}</p>}</div>{pKey && <div className="space-y-1.5 max-w-24"><Label htmlFor={pKey}>Padding</Label><Input id={pKey} type="number" min="1" max="10" value={padValue} onChange={(event) => setValues((current) => ({ ...current, [pKey]: Number(event.target.value) }))} aria-invalid={!!errors[pKey]} />{errors[pKey] && <p className="field-error">{errors[pKey][0]}</p>}</div>}<div className="min-w-36 self-end pb-2 text-sm text-muted-foreground">Next: <span className="tabular font-medium text-foreground">{prefix}{String(next).padStart(Math.max(1, padValue), "0")}</span></div></div></section>;
        })}
      </div>
      {serverError && <FormError message={serverError} />}
      <div className="mt-5 flex justify-end"><Button onClick={save} disabled={pending}>{pending && <LoaderCircle className="size-4 animate-spin" />} Save numbering</Button></div>
    </div>
  );
}
