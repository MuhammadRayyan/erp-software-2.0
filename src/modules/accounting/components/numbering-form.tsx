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

  const groups = [
    {
      title: "Sales & Customers",
      description: "Document sequences for receivables, quotes, and customer orders.",
      items: [
        { label: "Sales Invoices", prefixKey: "prefix", nextKey: "nextNumber", paddingKey: "padding" },
        { label: "Sales Credit Notes", prefixKey: "creditNotePrefix", nextKey: "creditNoteNextNumber", paddingKey: "creditNotePadding" },
        { label: "Sales Quotes", prefixKey: "salesQuotePrefix", nextKey: "salesQuoteNextNumber", paddingKey: "salesQuotePadding" },
        { label: "Sales Orders", prefixKey: "salesOrderPrefix", nextKey: "salesOrderNextNumber", paddingKey: "salesOrderPadding" },
        { label: "Customer Receipts", prefixKey: "receiptPrefix", nextKey: "receiptNextNumber", paddingKey: "receiptPadding" },
      ],
    },
    {
      title: "Purchases & Suppliers",
      description: "Document sequences for payables, purchase quotes, and purchase orders.",
      items: [
        { label: "Purchase Invoices", prefixKey: "purchaseInvoicePrefix", nextKey: "purchaseInvoiceNextNumber", paddingKey: "purchaseInvoicePadding" },
        { label: "Supplier Debit Notes", prefixKey: "debitNotePrefix", nextKey: "debitNoteNextNumber", paddingKey: "debitNotePadding" },
        { label: "Purchase Orders", prefixKey: "purchaseOrderPrefix", nextKey: "purchaseOrderNextNumber", paddingKey: "purchaseOrderPadding" },
        { label: "Purchase Quotes", prefixKey: "purchaseQuotePrefix", nextKey: "purchaseQuoteNextNumber", paddingKey: "purchaseQuotePadding" },
        { label: "Supplier Payments", prefixKey: "supplierPaymentPrefix", nextKey: "supplierPaymentNextNumber", paddingKey: "supplierPaymentPadding" },
      ],
    },
    {
      title: "Inventory & Projects",
      description: "Document sequences for inventory logistics, adjustments, and jobs.",
      items: [
        { label: "Delivery Notes", prefixKey: "deliveryNotePrefix", nextKey: "deliveryNoteNextNumber", paddingKey: "deliveryNotePadding" },
        { label: "Goods Receipts", prefixKey: "goodsReceiptPrefix", nextKey: "goodsReceiptNextNumber", paddingKey: "goodsReceiptPadding" },
        { label: "Stock Adjustments", prefixKey: "stockAdjustmentPrefix", nextKey: "stockAdjustmentNextNumber", paddingKey: "stockAdjustmentPadding" },
        { label: "Projects", prefixKey: "projectPrefix", nextKey: "projectNextNumber", paddingKey: "projectPadding" },
      ],
    },
    {
      title: "Banking & Financial Entries",
      description: "Sequences for bank movements and general journal postings.",
      items: [
        { label: "Bank Transactions", prefixKey: "bankTransactionPrefix", nextKey: "bankTransactionNextNumber", paddingKey: "bankTransactionPadding" },
        { label: "Bank Transfers", prefixKey: "bankTransferPrefix", nextKey: "bankTransferNextNumber", paddingKey: "bankTransferPadding" },
        { label: "Journal Entries", prefixKey: "journalPrefix", nextKey: "journalNextNumber", paddingKey: "journalPadding" },
      ],
    },
  ] as const;

  return (
    <div className="max-w-4xl space-y-8">
      <div className="rounded-lg border border-border bg-surface p-4 text-sm text-muted-foreground">
        Sequence prefixes and next numbers are allocated atomically by the server on document creation. Adjusting the next number does not alter existing historical records.
      </div>

      {groups.map((group) => (
        <section key={group.title} className="rounded-lg border border-border bg-surface-raised p-5 shadow-xs">
          <div className="border-b border-border pb-3">
            <h2 className="text-base font-semibold text-foreground">{group.title}</h2>
            <p className="text-xs text-muted-foreground">{group.description}</p>
          </div>
          <div className="divide-y divide-border/60">
            {group.items.map((sequence) => {
              const prefix = String(values[sequence.prefixKey as keyof typeof values] ?? "");
              const next = Number(values[sequence.nextKey as keyof typeof values] ?? 1);
              const pKey = sequence.paddingKey as keyof InvoiceNumberingInput;
              const padValue = pKey && values[pKey] != null ? Number(values[pKey]) : 4;
              const sample = `${prefix}${String(next).padStart(Math.max(1, padValue), "0")}`;

              return (
                <div key={sequence.label} className="py-4 first:pt-4 last:pb-0">
                  <div className="grid gap-3 sm:grid-cols-[1.5fr_1fr_1fr_1.2fr] sm:items-end">
                    <div className="space-y-1">
                      <Label htmlFor={sequence.prefixKey} className="text-xs font-medium text-foreground">
                        {sequence.label} Prefix
                      </Label>
                      <Input
                        id={sequence.prefixKey}
                        value={prefix}
                        onChange={(e) => setValues((c) => ({ ...c, [sequence.prefixKey]: e.target.value }))}
                        aria-invalid={!!errors[sequence.prefixKey]}
                        className="h-9 font-mono text-sm"
                      />
                      {errors[sequence.prefixKey] && <p className="field-error">{errors[sequence.prefixKey][0]}</p>}
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor={sequence.nextKey} className="text-xs font-medium text-foreground">
                        Next Number
                      </Label>
                      <Input
                        id={sequence.nextKey}
                        type="number"
                        min="1"
                        value={next}
                        onChange={(e) => setValues((c) => ({ ...c, [sequence.nextKey]: Number(e.target.value) }))}
                        aria-invalid={!!errors[sequence.nextKey]}
                        className="h-9 font-mono text-sm"
                      />
                      {errors[sequence.nextKey] && <p className="field-error">{errors[sequence.nextKey][0]}</p>}
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor={pKey} className="text-xs font-medium text-foreground">
                        Digits (Padding)
                      </Label>
                      <Input
                        id={pKey}
                        type="number"
                        min="1"
                        max="10"
                        value={padValue}
                        onChange={(e) => setValues((c) => ({ ...c, [pKey]: Number(e.target.value) }))}
                        aria-invalid={!!errors[pKey]}
                        className="h-9 font-mono text-sm"
                      />
                      {errors[pKey] && <p className="field-error">{errors[pKey][0]}</p>}
                    </div>

                    <div className="space-y-1">
                      <span className="block text-[11px] font-medium text-muted-foreground">Preview Next</span>
                      <div className="flex h-9 items-center justify-between rounded-md border border-border bg-surface-muted/60 px-3 font-mono text-xs font-medium text-foreground">
                        <span>{sample}</span>
                        <span className="text-[10px] text-muted-foreground uppercase">live</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {serverError && <FormError message={serverError} />}

      <div className="sticky bottom-4 z-10 flex items-center justify-between rounded-lg border border-border bg-surface/95 p-3 shadow-md backdrop-blur-sm">
        <p className="text-xs text-muted-foreground">Make sure prefixes end with a separator like &ldquo;-&rdquo; if desired.</p>
        <Button onClick={save} disabled={pending}>
          {pending && <LoaderCircle className="size-4 animate-spin mr-1.5" />}
          Save all numbering sequences
        </Button>
      </div>
    </div>
  );
}
