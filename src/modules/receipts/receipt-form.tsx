"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { useForm, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney } from "@/core/format";
import { DocumentCurrencyFields, type DocumentCurrencyOption, type DocumentRateOption } from "@/modules/currency/document-currency-fields";
import { createReceiptAction } from "./actions";
import { receiptInputSchema, type ReceiptInput } from "./receipt-input";

type Option = { id: string; name: string };
type InvoiceOption = {
  id: string;
  invoiceNumber: string;
  customerId: string;
  balanceMinor: number;
  currencyCode: string;
  minorUnit: number;
};

const selectClass =
  "h-9 w-full rounded-[6px] border border-border-strong bg-surface-raised px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring/25";

export function ReceiptForm({
  businessId,
  currency,
  customers,
  invoices,
  bankAccounts,
  currencies,
  rates,
  initial,
}: {
  businessId: string;
  currency: string;
  customers: Option[];
  invoices: InvoiceOption[];
  bankAccounts: Option[];
  currencies: DocumentCurrencyOption[];
  rates: DocumentRateOption[];
  initial: ReceiptInput;
}) {
  const [serverError, setServerError] = useState("");
  const form = useForm<ReceiptInput>({
    resolver: zodResolver(receiptInputSchema),
    defaultValues: initial,
  });
  const {
    register,
    control,
    handleSubmit,
    setError,
    setValue,
    formState: { errors, isSubmitting },
  } = form;
  const customerId = useWatch({ control, name: "customerId" });
  const invoiceId = useWatch({ control, name: "invoiceId" });
  const customerInvoices = useMemo(
    () => invoices.filter((invoice) => invoice.customerId === customerId),
    [customerId, invoices],
  );
  const selectedInvoice = invoices.find((invoice) => invoice.id === invoiceId);
  const currencyCode = useWatch({ control, name: "currencyCode" }) || currency;
  const exchangeRateToBase = useWatch({ control, name: "exchangeRateToBase" }) || "";
  const exchangeRateDate = useWatch({ control, name: "exchangeRateDate" }) || "";
  const exchangeRateSource = useWatch({ control, name: "exchangeRateSource" }) || "";
  const receiptDate = useWatch({ control, name: "date" }) || "";

  async function submit(values: ReceiptInput) {
    setServerError("");
    const result = await createReceiptAction(businessId, values);
    if (result.fieldErrors) {
      for (const [field, messages] of Object.entries(result.fieldErrors)) {
        setError(field as keyof ReceiptInput, { message: messages[0] });
      }
    }
    if (result.error) setServerError(result.error);
  }

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-7" noValidate>
      {serverError && (
        <div role="alert" className="rounded-md border border-danger/25 bg-danger/10 px-3 py-2.5 text-sm text-danger">
          {serverError}
        </div>
      )}
      <section className="border-b border-border pb-7">
        <h2 className="text-base font-semibold">Receipt details</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Posting debits the selected Bank or Cash account and credits Accounts Receivable.
        </p>
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="customerId">Customer</Label>
            <select
              id="customerId"
              className={selectClass}
              {...register("customerId", {
                onChange: () => setValue("invoiceId", "", { shouldValidate: false }),
              })}
              aria-invalid={!!errors.customerId}
            >
              <option value="">Choose a customer…</option>
              {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
            </select>
            {errors.customerId && <p className="field-error">{errors.customerId.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="invoiceId">Invoice</Label>
            <select id="invoiceId" className={selectClass} {...register("invoiceId", { onChange: (event) => { const invoice = invoices.find((entry) => entry.id === event.target.value); const code = invoice?.currencyCode ?? currency; setValue("currencyCode", code); setValue("exchangeRateToBase", code === currency ? "1" : ""); setValue("exchangeRateDate", code === currency ? receiptDate : ""); setValue("exchangeRateSource", code === currency ? "Base" : ""); } })} aria-invalid={!!errors.invoiceId}>
              <option value="">Choose an outstanding invoice…</option>
              {customerInvoices.map((invoice) => (
                <option key={invoice.id} value={invoice.id}>
                  {invoice.invoiceNumber} · {formatMoney(invoice.balanceMinor, invoice.currencyCode, invoice.minorUnit)} outstanding
                </option>
              ))}
            </select>
            {errors.invoiceId && <p className="field-error">{errors.invoiceId.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="date">Receipt date</Label>
            <Input id="date" type="date" {...register("date")} aria-invalid={!!errors.date} />
            {errors.date && <p className="field-error">{errors.date.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bankAccountId">Deposit to</Label>
            <select id="bankAccountId" className={selectClass} {...register("bankAccountId")} aria-invalid={!!errors.bankAccountId}>
              <option value="">Choose Bank or Cash…</option>
              {bankAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
            </select>
            {errors.bankAccountId && <p className="field-error">{errors.bankAccountId.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="amount">Amount</Label>
            <Input id="amount" type="number" min="0.000001" step="0.000001" className="money text-right" {...register("amount")} aria-invalid={!!errors.amount} />
            {selectedInvoice && <p className="text-xs text-muted-foreground">Maximum {formatMoney(selectedInvoice.balanceMinor, selectedInvoice.currencyCode, selectedInvoice.minorUnit)}</p>}
            {errors.amount && <p className="field-error">{errors.amount.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reference">Reference <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Input id="reference" {...register("reference")} />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="description">Description <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Input id="description" {...register("description")} />
          </div>
        </div>
      </section>
      <section className="border-b border-border pb-7">
        <h2 className="mb-4 text-base font-semibold">Settlement currency</h2>
        <DocumentCurrencyFields baseCurrencyCode={currency} currencies={currencies} rates={rates} currencyCode={currencyCode} exchangeRateToBase={exchangeRateToBase} exchangeRateDate={exchangeRateDate} exchangeRateSource={exchangeRateSource} relevantDate={receiptDate} lockCurrency onChange={(field, value) => setValue(field, value)} />
        <p className="mt-3 text-xs text-muted-foreground">Receipts use the invoice currency. The Bank/Cash account and journal remain in {currency}; any difference posts to Realized FX Gain/Loss.</p>
      </section>
      <div className="flex justify-end gap-2">
        <Button asChild variant="ghost"><Link href={`/b/${businessId}/sales/invoices`}>Cancel</Link></Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <LoaderCircle className="size-4 animate-spin" />} Post Receipt
        </Button>
      </div>
    </form>
  );
}
