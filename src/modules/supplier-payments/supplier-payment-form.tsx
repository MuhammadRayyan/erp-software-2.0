"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle, Sparkles, CheckCheck, RotateCcw, AlertTriangle, Coins, FileText } from "lucide-react";
import { useForm, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectNative } from "@/components/ui/select-native";
import { FormError } from "@/components/form-error";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatMoney } from "@/core/format";
import { minorToCurrencyInput, parseCurrencyAmountToMinor } from "@/modules/currency/conversion";
import { DocumentCurrencyFields, type DocumentCurrencyOption, type DocumentRateOption } from "@/modules/currency/document-currency-fields";
import { createSupplierPaymentAction } from "./actions";
import { supplierPaymentInputSchema, type SupplierPaymentInput } from "./supplier-payment-input";

type Option = { id: string; name: string };

export type InvoiceOption = {
  id: string;
  internalNumber: string;
  supplierId: string;
  invoiceDate: string;
  dueDate: string;
  totalMinor: number;
  balanceMinor: number;
  currencyCode: string;
  minorUnit: number;
};

export function SupplierPaymentForm({
  businessId,
  currency,
  suppliers,
  invoices,
  bankAccounts,
  currencies,
  rates,
  initial,
}: {
  businessId: string;
  currency: string;
  suppliers: Option[];
  invoices: InvoiceOption[];
  bankAccounts: Option[];
  currencies: DocumentCurrencyOption[];
  rates: DocumentRateOption[];
  initial: SupplierPaymentInput;
}) {
  const [serverError, setServerError] = useState("");

  // Track allocation inputs per invoice: invoiceId -> string amount
  const [allocationsMap, setAllocationsMap] = useState<Record<string, string>>(() => {
    const initialInvId = initial.purchaseInvoiceId || initial.invoiceId;
    if (initialInvId && initial.amount) {
      return { [initialInvId]: initial.amount };
    }
    return {};
  });

  const form = useForm<SupplierPaymentInput>({
    resolver: zodResolver(supplierPaymentInputSchema),
    mode: "onTouched",
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

  const supplierId = useWatch({ control, name: "supplierId" });
  const watchedAmount = useWatch({ control, name: "amount" }) || "";
  const currencyCode = useWatch({ control, name: "currencyCode" }) || currency;
  const exchangeRateToBase = useWatch({ control, name: "exchangeRateToBase" }) || "";
  const exchangeRateDate = useWatch({ control, name: "exchangeRateDate" }) || "";
  const exchangeRateSource = useWatch({ control, name: "exchangeRateSource" }) || "";
  const paymentDate = useWatch({ control, name: "date" }) || "";

  const activeCurrencyOption = currencies.find((c) => c.code === currencyCode);
  const minorUnit = activeCurrencyOption?.minorUnit ?? 2;

  // Filter invoices for selected supplier and currency
  const supplierInvoices = useMemo(
    () => invoices.filter((inv) => inv.supplierId === supplierId && inv.currencyCode === currencyCode),
    [supplierId, invoices, currencyCode],
  );

  // Safe minor unit parsing
  let totalAmountMinor = 0;
  try {
    if (watchedAmount.trim()) {
      totalAmountMinor = parseCurrencyAmountToMinor(watchedAmount, minorUnit, "Amount");
    }
  } catch {
    totalAmountMinor = 0;
  }

  // Calculate total allocated from state
  const totalAllocatedMinor = useMemo(() => {
    let sum = 0;
    for (const [invId, amtStr] of Object.entries(allocationsMap)) {
      if (!amtStr || !amtStr.trim()) continue;
      const invoice = supplierInvoices.find((i) => i.id === invId);
      if (!invoice) continue;
      try {
        const minor = parseCurrencyAmountToMinor(amtStr, invoice.minorUnit, "Allocation");
        if (minor > 0) sum += minor;
      } catch {
        // invalid input ignored in sum
      }
    }
    return sum;
  }, [allocationsMap, supplierInvoices]);

  const unallocatedMinor = Math.max(0, totalAmountMinor - totalAllocatedMinor);
  const isOverAllocated = totalAllocatedMinor > totalAmountMinor && totalAmountMinor > 0;

  function handleSupplierChange(newSupplierId: string) {
    setValue("supplierId", newSupplierId, { shouldValidate: true });
    setAllocationsMap({});

    // If supplier has open invoices, pick their currency
    const openInvoicesForSupplier = invoices.filter((i) => i.supplierId === newSupplierId);
    if (openInvoicesForSupplier.length > 0 && openInvoicesForSupplier[0]?.currencyCode) {
      const targetCode = openInvoicesForSupplier[0].currencyCode;
      setValue("currencyCode", targetCode);
      setValue("exchangeRateToBase", targetCode === currency ? "1" : "");
      setValue("exchangeRateDate", targetCode === currency ? paymentDate : "");
      setValue("exchangeRateSource", targetCode === currency ? "Base" : "");
    }
  }

  function handleAllocationChange(invoiceId: string, value: string) {
    setAllocationsMap((prev) => ({
      ...prev,
      [invoiceId]: value,
    }));
  }

  function handlePayFull(invoice: InvoiceOption) {
    const fullStr = minorToCurrencyInput(invoice.balanceMinor, invoice.minorUnit);
    setAllocationsMap((prev) => {
      const next = { ...prev, [invoice.id]: fullStr };
      return next;
    });

    if (totalAmountMinor === 0) {
      setValue("amount", fullStr, { shouldValidate: true });
    }
  }

  function handleAutoAllocateFifo() {
    if (totalAmountMinor <= 0) {
      setError("amount", { message: "Please enter a payment amount first to auto-allocate" });
      return;
    }

    const sorted = [...supplierInvoices].sort((a, b) => a.invoiceDate.localeCompare(b.invoiceDate));
    let remainingMinor = totalAmountMinor;
    const nextAllocations: Record<string, string> = {};

    for (const inv of sorted) {
      if (remainingMinor <= 0) break;
      const allocMinor = Math.min(inv.balanceMinor, remainingMinor);
      if (allocMinor > 0) {
        nextAllocations[inv.id] = minorToCurrencyInput(allocMinor, inv.minorUnit);
        remainingMinor -= allocMinor;
      }
    }

    setAllocationsMap(nextAllocations);
  }

  function handlePayAllBills() {
    const totalOpenMinor = supplierInvoices.reduce((sum, inv) => sum + inv.balanceMinor, 0);
    if (totalOpenMinor <= 0) return;

    const nextAllocations: Record<string, string> = {};
    for (const inv of supplierInvoices) {
      nextAllocations[inv.id] = minorToCurrencyInput(inv.balanceMinor, inv.minorUnit);
    }

    setAllocationsMap(nextAllocations);
    setValue("amount", minorToCurrencyInput(totalOpenMinor, minorUnit), { shouldValidate: true });
  }

  function handleClearAllocations() {
    setAllocationsMap({});
  }

  async function submit(values: SupplierPaymentInput) {
    setServerError("");

    const finalAllocations: { invoiceId: string; amount: string }[] = [];
    for (const [invId, amtStr] of Object.entries(allocationsMap)) {
      if (!amtStr || !amtStr.trim()) continue;
      try {
        const minor = parseCurrencyAmountToMinor(amtStr, minorUnit, "Allocation");
        if (minor > 0) {
          finalAllocations.push({ invoiceId: invId, amount: amtStr.trim() });
        }
      } catch (err) {
        setServerError(err instanceof Error ? err.message : "Invalid allocation amount");
        return;
      }
    }

    if (totalAllocatedMinor > totalAmountMinor) {
      setServerError(`Allocated total (${formatMoney(totalAllocatedMinor, currencyCode, minorUnit)}) exceeds payment amount (${formatMoney(totalAmountMinor, currencyCode, minorUnit)}).`);
      return;
    }

    const payload: SupplierPaymentInput = {
      ...values,
      allocations: finalAllocations,
      purchaseInvoiceId: finalAllocations.length === 1 ? finalAllocations[0]?.invoiceId : undefined,
      invoiceId: finalAllocations.length === 1 ? finalAllocations[0]?.invoiceId : undefined,
    };

    const result = await createSupplierPaymentAction(businessId, payload);
    if (result.fieldErrors) {
      for (const [field, messages] of Object.entries(result.fieldErrors)) {
        setError(field as keyof SupplierPaymentInput, { message: messages[0] });
      }
    }
    if (result.error) setServerError(result.error);
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-7 max-w-4xl" noValidate>
      {serverError && <FormError message={serverError} />}

      <section className="border-b border-border pb-7">
        <h2 className="text-base font-semibold">Payment Details</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Posting debits Accounts Payable and credits the selected Bank or Cash account. Allocate across one or more open bills, or record as an unallocated vendor prepayment deposit.
        </p>

        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="supplierId">Supplier</Label>
            <SelectNative
              id="supplierId"
              {...register("supplierId", {
                onChange: (e) => handleSupplierChange(e.target.value),
              })}
              aria-invalid={!!errors.supplierId}
            >
              <option value="">Choose a supplier…</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </SelectNative>
            {errors.supplierId && <p className="field-error">{errors.supplierId.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bankAccountId">Pay From (Bank / Cash Account)</Label>
            <SelectNative id="bankAccountId" {...register("bankAccountId")} aria-invalid={!!errors.bankAccountId}>
              <option value="">Choose Bank or Cash…</option>
              {bankAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </SelectNative>
            {errors.bankAccountId && <p className="field-error">{errors.bankAccountId.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="date">Payment Date</Label>
            <Input id="date" type="date" {...register("date")} aria-invalid={!!errors.date} />
            {errors.date && <p className="field-error">{errors.date.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="amount">Amount Paid ({currencyCode})</Label>
            <Input
              id="amount"
              type="number"
              min="0.000001"
              step="0.000001"
              className="money text-right font-medium text-base"
              {...register("amount")}
              aria-invalid={!!errors.amount}
            />
            {errors.amount && <p className="field-error">{errors.amount.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reference">
              Reference <span className="font-normal text-muted-foreground">(Cheque / Wire / Transfer Ref)</span>
            </Label>
            <Input id="reference" placeholder="e.g. WIRE-OUT-77123" {...register("reference")} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">
              Description <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input id="description" placeholder="e.g. Monthly supplier bill settlement" {...register("description")} />
          </div>
        </div>
      </section>

      {/* Bill Allocations Section */}
      <section className="border-b border-border pb-7">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold flex items-center gap-2">
              <FileText className="size-4 text-primary" /> Purchase Bill Allocations
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Allocate payment across open bills, or leave unallocated as a vendor prepayment credit.
            </p>
          </div>

          {supplierId && supplierInvoices.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleAutoAllocateFifo}
                className="text-xs"
                title="Automatically allocates payment starting from the oldest bill"
              >
                <Sparkles className="mr-1.5 size-3.5 text-amber-500" /> Auto-Allocate FIFO
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handlePayAllBills}
                className="text-xs"
                title="Sets allocations and total amount to pay all open bills in full"
              >
                <CheckCheck className="mr-1.5 size-3.5 text-emerald-600" /> Pay All Open
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleClearAllocations}
                className="text-xs text-muted-foreground"
              >
                <RotateCcw className="mr-1.5 size-3" /> Clear
              </Button>
            </div>
          )}
        </div>

        {!supplierId ? (
          <div className="mt-4 rounded-md border border-dashed border-border bg-surface-muted/30 p-6 text-center text-sm text-muted-foreground">
            Please choose a supplier above to view their outstanding bills and allocate funds.
          </div>
        ) : supplierInvoices.length === 0 ? (
          <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-900 dark:text-amber-300">
            <div className="flex items-start gap-3">
              <Coins className="size-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
              <div>
                <h4 className="font-semibold">Pure Vendor Prepayment Deposit</h4>
                <p className="mt-0.5 text-xs">
                  This supplier has no open bills in {currencyCode}. The full payment amount will be debited to Accounts Payable and held as an unallocated prepayment credit pool for future purchase invoices.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-lg border border-border">
            <table className="data-table min-w-[720px]">
              <thead>
                <tr>
                  <th>Bill #</th>
                  <th>Date</th>
                  <th>Due Date</th>
                  <th className="text-right!">Bill Total</th>
                  <th className="text-right!">Open Balance</th>
                  <th className="text-right! w-44">Allocate Amount</th>
                  <th className="text-center! w-24">Action</th>
                </tr>
              </thead>
              <tbody>
                {supplierInvoices.map((invoice) => {
                  const currentAllocStr = allocationsMap[invoice.id] || "";
                  const isOverdue = invoice.dueDate && invoice.dueDate < today;

                  return (
                    <tr key={invoice.id}>
                      <td>
                        <span className="font-medium tabular text-primary">{invoice.internalNumber}</span>
                      </td>
                      <td className="text-xs text-muted-foreground">{formatDate(invoice.invoiceDate)}</td>
                      <td className="text-xs">
                        {formatDate(invoice.dueDate)}
                        {isOverdue && <Badge tone="danger" className="ml-2 text-[10px] py-0 px-1">Overdue</Badge>}
                      </td>
                      <td className="money text-right text-xs">
                        {formatMoney(invoice.totalMinor, invoice.currencyCode, invoice.minorUnit)}
                      </td>
                      <td className="money text-right font-medium">
                        {formatMoney(invoice.balanceMinor, invoice.currencyCode, invoice.minorUnit)}
                      </td>
                      <td className="text-right">
                        <Input
                          type="number"
                          step="0.000001"
                          min="0"
                          placeholder="0.00"
                          className="money text-right h-8 text-sm"
                          value={currentAllocStr}
                          onChange={(e) => handleAllocationChange(invoice.id, e.target.value)}
                        />
                      </td>
                      <td className="text-center">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 text-xs font-normal hover:bg-primary/10 hover:text-primary"
                          onClick={() => handlePayFull(invoice)}
                        >
                          Pay Full
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Live Allocation Summary Bar */}
        {supplierId && (
          <div className="mt-4 grid gap-3 sm:grid-cols-3 rounded-lg border border-border bg-surface-muted/40 p-4 text-sm">
            <div>
              <span className="text-xs text-muted-foreground block">Total Paid from Bank</span>
              <span className="money text-base font-semibold">
                {formatMoney(totalAmountMinor, currencyCode, minorUnit)}
              </span>
            </div>
            <div>
              <span className="text-xs text-muted-foreground block">Allocated to Bills</span>
              <span className={`money text-base font-semibold ${isOverAllocated ? "text-danger" : ""}`}>
                {formatMoney(totalAllocatedMinor, currencyCode, minorUnit)}
              </span>
            </div>
            <div>
              <span className="text-xs text-muted-foreground block">
                {unallocatedMinor > 0 ? "Vendor Prepayment Surplus" : "Unallocated Balance"}
              </span>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="money text-base font-semibold text-emerald-600 dark:text-emerald-400">
                  {formatMoney(unallocatedMinor, currencyCode, minorUnit)}
                </span>
                {unallocatedMinor > 0 && (
                  <Badge tone="success" className="text-[10px]">
                    Vendor Prepayment Pool
                  </Badge>
                )}
              </div>
            </div>
          </div>
        )}

        {isOverAllocated && (
          <div className="mt-3 flex items-center gap-2 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-400">
            <AlertTriangle className="size-4 shrink-0" />
            <span>
              The total allocated across bills ({formatMoney(totalAllocatedMinor, currencyCode, minorUnit)}) exceeds the payment amount ({formatMoney(totalAmountMinor, currencyCode, minorUnit)}).
            </span>
          </div>
        )}
      </section>

      {/* Currency Section */}
      <section className="border-b border-border pb-7">
        <h2 className="mb-4 text-base font-semibold">Settlement Currency</h2>
        <DocumentCurrencyFields
          baseCurrencyCode={currency}
          currencies={currencies}
          rates={rates}
          currencyCode={currencyCode}
          exchangeRateToBase={exchangeRateToBase}
          exchangeRateDate={exchangeRateDate}
          exchangeRateSource={exchangeRateSource}
          relevantDate={paymentDate}
          lockCurrency={false}
          onChange={(field, val) => setValue(field, val)}
        />
        <p className="mt-3 text-xs text-muted-foreground">
          Payments record in the settlement currency. The Bank/Cash account and General Ledger entries reflect base currency equivalent; any FX differences post to Realized FX Gain/Loss.
        </p>
      </section>

      <div className="flex justify-end gap-2">
        <Button asChild variant="ghost">
          <Link href={`/b/${businessId}/purchases/payments`}>Cancel</Link>
        </Button>
        <Button type="submit" disabled={isSubmitting || isOverAllocated}>
          {isSubmitting && <LoaderCircle className="size-4 animate-spin" />} Post Payment
        </Button>
      </div>
    </form>
  );
}
