"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleDollarSign, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { SelectNative } from "@/components/ui/select-native";
import { SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetRoot, SheetTitle } from "@/components/ui/sheet";
import { FormError } from "@/components/form-error";
import { broadcastLiveRefresh } from "@/components/use-live-refresh";
import { formatMoney } from "@/core/format";
import { minorToCurrencyInput, parseCurrencyAmountToMinor } from "@/modules/currency/conversion";
import { DocumentCurrencyFields } from "@/modules/currency/document-currency-fields";
import { createReceiptAction } from "@/modules/receipts/actions";
import { createSupplierPaymentAction } from "@/modules/supplier-payments/actions";
import {
  getRecordPaymentContextAction,
  type RecordPaymentContext,
  type RecordPaymentKind,
} from "@/modules/settlement/record-payment-actions";

type Values = {
  date: string;
  bankAccountId: string;
  amount: string;
  reference: string;
  exchangeRateToBase: string;
  exchangeRateDate: string;
  exchangeRateSource: string;
};

const COPY = {
  receipt: {
    title: "Record receipt",
    action: "Record Receipt",
    dateLabel: "Receipt date",
    bankLabel: "Deposit to",
    party: "Customer",
    success: "Receipt posted",
    pending: "Receipt submitted for approval",
    fullForm: (businessId: string, id: string) => `/b/${businessId}/sales/receipts/new?invoiceId=${id}`,
    view: (businessId: string, id: string) => `/b/${businessId}/sales/receipts/${id}`,
  },
  payment: {
    title: "Record payment",
    action: "Record Payment",
    dateLabel: "Payment date",
    bankLabel: "Pay from",
    party: "Supplier",
    success: "Supplier payment posted",
    pending: "Payment submitted for approval",
    fullForm: (businessId: string, id: string) => `/b/${businessId}/purchases/payments/new?invoiceId=${id}`,
    view: (businessId: string, id: string) => `/b/${businessId}/purchases/payments/${id}`,
  },
} as const;

/**
 * Settle one open sales or purchase invoice without leaving the page: the
 * amount defaults to the open balance and the bank to the configured default.
 * Multi-document allocations stay on the full receipt/payment form.
 */
export function RecordPaymentSheet({
  businessId,
  kind,
  documentId,
  open,
  onOpenChange,
}: {
  businessId: string;
  kind: RecordPaymentKind;
  documentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const copy = COPY[kind];
  const [context, setContext] = useState<RecordPaymentContext | null>(null);
  const [loadError, setLoadError] = useState("");
  const [values, setValues] = useState<Values | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof Values, string>>>({});
  const [serverError, setServerError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setContext(null);
    setValues(null);
    setErrors({});
    setServerError("");
    setLoadError("");
    getRecordPaymentContextAction(businessId, kind, documentId).then((result) => {
      if (cancelled) return;
      if (!result.context) {
        setLoadError(result.error ?? "Could not load this document.");
        return;
      }
      const loaded = result.context;
      const foreign = loaded.currencyCode !== loaded.baseCurrencyCode;
      setContext(loaded);
      setValues({
        date: loaded.today,
        bankAccountId: loaded.defaultBankAccountId,
        amount: minorToCurrencyInput(loaded.balanceMinor, loaded.minorUnit),
        reference: "",
        exchangeRateToBase: foreign ? "" : "1",
        exchangeRateDate: foreign ? "" : loaded.today,
        exchangeRateSource: foreign ? "" : "Base",
      });
    });
    return () => {
      cancelled = true;
    };
  }, [open, businessId, kind, documentId]);

  const update = useCallback(<K extends keyof Values>(field: K, value: Values[K]) => {
    setValues((current) => (current ? { ...current, [field]: value } : current));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }, []);

  function validate(current: Values, loaded: RecordPaymentContext) {
    const next: Partial<Record<keyof Values, string>> = {};
    if (!current.date) next.date = "Choose a date.";
    if (!current.bankAccountId) next.bankAccountId = "Choose a bank or cash account.";
    try {
      const minor = parseCurrencyAmountToMinor(current.amount, loaded.minorUnit);
      if (minor <= 0) next.amount = "Enter an amount greater than zero.";
      else if (minor > loaded.balanceMinor) {
        next.amount = `Cannot exceed the open balance of ${formatMoney(loaded.balanceMinor, loaded.currencyCode, loaded.minorUnit)}.`;
      }
    } catch {
      next.amount = "Enter a valid amount.";
    }
    if (loaded.currencyCode !== loaded.baseCurrencyCode && !current.exchangeRateToBase) {
      next.exchangeRateToBase = "Add an exchange rate for this date in Settings → Currencies.";
    }
    return next;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!context || !values) return;
    const validation = validate(values, context);
    setErrors(validation);
    const firstInvalid = (Object.keys(validation) as (keyof Values)[]).find((key) => validation[key]);
    if (firstInvalid) {
      document.getElementById(`record-payment-${firstInvalid}`)?.focus();
      return;
    }
    setSubmitting(true);
    setServerError("");
    const shared = {
      bankAccountId: values.bankAccountId,
      date: values.date,
      amount: values.amount,
      reference: values.reference,
      currencyCode: context.currencyCode,
      exchangeRateToBase: values.exchangeRateToBase,
      exchangeRateDate: values.exchangeRateDate,
      exchangeRateSource: values.exchangeRateSource,
      allocations: [{ invoiceId: context.documentId, amount: values.amount }],
    };
    try {
      const result = kind === "receipt"
        ? await createReceiptAction(businessId, { ...shared, customerId: context.partyId, invoiceId: context.documentId }, "stay")
        : await createSupplierPaymentAction(businessId, { ...shared, supplierId: context.partyId, purchaseInvoiceId: context.documentId }, "stay");
      if (result.error || !result.saved) {
        setServerError(result.error ?? "Could not record this payment.");
        if (result.fieldErrors) {
          const mapped: Partial<Record<keyof Values, string>> = {};
          for (const [field, messages] of Object.entries(result.fieldErrors)) {
            if (field in values && messages?.[0]) mapped[field as keyof Values] = messages[0];
          }
          setErrors(mapped);
        }
        return;
      }
      const saved = result.saved;
      toast.success(`${saved.documentStatus === "pending_approval" ? copy.pending : copy.success}: ${saved.number}`, {
        action: { label: "View", onClick: () => router.push(copy.view(businessId, saved.id)) },
      });
      broadcastLiveRefresh();
      onOpenChange(false);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  const foreign = context ? context.currencyCode !== context.baseCurrencyCode : false;

  return (
    <SheetRoot open={open} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <SheetContent aria-describedby={undefined}>
        <form className="flex h-full flex-col" onSubmit={submit} noValidate>
          <SheetHeader>
            <SheetTitle>{copy.title}</SheetTitle>
            <SheetDescription>
              {context ? `${context.documentNumber} · ${context.partyName}` : "Loading document…"}
            </SheetDescription>
          </SheetHeader>
          <SheetBody>
            {loadError ? <FormError message={loadError} /> : null}
            {!context || !values ? (
              !loadError && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
                  <LoaderCircle className="size-4 animate-spin" /> Loading…
                </div>
              )
            ) : (
              <>
                <div className="rounded-lg border border-border bg-surface-muted px-3.5 py-3">
                  <p className="text-xs font-medium text-muted-foreground">Open balance</p>
                  <p className="tabular mt-0.5 text-lg font-semibold">
                    {formatMoney(context.balanceMinor, context.currencyCode, context.minorUnit)}
                  </p>
                </div>
                <FormField label="Amount" htmlFor="record-payment-amount" required error={errors.amount}
                  hint={`Defaults to the full open balance. Enter less to record a partial ${kind}.`}>
                  <Input
                    id="record-payment-amount"
                    inputMode="decimal"
                    className="tabular"
                    value={values.amount}
                    onChange={(event) => update("amount", event.target.value)}
                    autoFocus
                  />
                </FormField>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label={copy.dateLabel} htmlFor="record-payment-date" required error={errors.date}>
                    <Input id="record-payment-date" type="date" value={values.date}
                      onChange={(event) => update("date", event.target.value)} />
                  </FormField>
                  <FormField label={copy.bankLabel} htmlFor="record-payment-bankAccountId" required error={errors.bankAccountId}>
                    <SelectNative id="record-payment-bankAccountId" value={values.bankAccountId}
                      onChange={(event) => update("bankAccountId", event.target.value)}>
                      {context.bankAccounts.length === 0 ? <option value="">No bank or cash accounts</option> : null}
                      {context.bankAccounts.map((account) => (
                        <option key={account.id} value={account.id}>{account.name}</option>
                      ))}
                    </SelectNative>
                  </FormField>
                </div>
                {foreign ? (
                  <div className="space-y-1.5">
                    <DocumentCurrencyFields
                      baseCurrencyCode={context.baseCurrencyCode}
                      currencies={[context.currency]}
                      rates={context.rates}
                      currencyCode={context.currencyCode}
                      exchangeRateToBase={values.exchangeRateToBase}
                      exchangeRateDate={values.exchangeRateDate}
                      exchangeRateSource={values.exchangeRateSource}
                      relevantDate={values.date}
                      lockCurrency
                      onChange={(field, value) => {
                        if (field !== "currencyCode") update(field, value);
                      }}
                    />
                    {errors.exchangeRateToBase ? <FormError message={errors.exchangeRateToBase} /> : null}
                  </div>
                ) : null}
                <FormField label="Reference" htmlFor="record-payment-reference" optional>
                  <Input id="record-payment-reference" value={values.reference} maxLength={100}
                    placeholder="Cheque or transfer number"
                    onChange={(event) => update("reference", event.target.value)} />
                </FormField>
                {serverError ? <FormError message={serverError} /> : null}
              </>
            )}
          </SheetBody>
          <SheetFooter className="justify-between">
            <Link href={copy.fullForm(businessId, documentId)} className="text-[13px] font-medium text-primary hover:underline">
              Open full form
            </Link>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
              <Button type="submit" disabled={!context || submitting} className="gap-1.5">
                {submitting ? <LoaderCircle className="size-4 animate-spin" /> : <CircleDollarSign className="size-4" />}
                {copy.action}
              </Button>
            </div>
          </SheetFooter>
        </form>
      </SheetContent>
    </SheetRoot>
  );
}
