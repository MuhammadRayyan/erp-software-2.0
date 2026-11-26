"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm, useWatch, type Resolver } from "react-hook-form";
import { AlertTriangle, CheckCheck, Coins, FileText, LoaderCircle, RotateCcw, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SplitActionButton } from "@/components/ui/split-action-button";
import { DocumentFormFooter } from "@/components/document-form-footer";
import {
  QuickCreateCustomerDialog,
  QuickCreateSupplierDialog,
} from "@/components/documents/quick-create-modals";
import { FormError } from "@/components/form-error";
import { useActionPermission, useApprovalPolicy } from "@/components/permissions-provider";
import { formatDate, formatMoney, getBusinessTodayIso } from "@/core/format";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { minorToCurrencyInput, parseCurrencyAmountToMinor } from "@/modules/currency/conversion";
import {
  DocumentCurrencyFields,
  type DocumentCurrencyOption,
  type DocumentRateOption,
} from "@/modules/currency/document-currency-fields";
import {
  allocateFifo,
  computeAllocationTotals,
  safeParseMinorAmount,
  type SettlementOpenDocument,
} from "./settlement-allocation-math";
import { FieldError } from "@/components/ui/field-error";
import { fieldErrorProps, fieldErrorId, focusFirstInvalidField } from "@/lib/form-errors";

export type SettlementOption = { id: string; name: string };

export type SettlementFormValues = {
  counterpartyId: string;
  bankAccountId: string;
  date: string;
  amount: string;
  reference: string;
  description: string;
  currencyCode: string;
  exchangeRateToBase: string;
  exchangeRateDate: string;
  exchangeRateSource: string;
  allocations: Record<string, string>;
};

export type SettlementSubmitResult = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

export type SettlementSubmitPayload = {
  counterpartyId: string;
  bankAccountId: string;
  date: string;
  amount: string;
  reference: string;
  description: string;
  currencyCode: string;
  exchangeRateToBase: string;
  exchangeRateDate: string;
  exchangeRateSource: string;
  allocations: { invoiceId: string; amount: string }[];
};

export interface SettlementAllocationFormProps {
  direction: "receipt" | "payment";
  businessId: string;
  currency: string;
  counterparties: SettlementOption[];
  documents: SettlementOpenDocument[];
  bankAccounts: SettlementOption[];
  currencies: DocumentCurrencyOption[];
  rates: DocumentRateOption[];
  initial: SettlementFormValues;
  cancelHref: string;
  onSubmitAction: (
    payload: SettlementSubmitPayload,
    afterSave?: "view" | "new",
  ) => Promise<SettlementSubmitResult>;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const settlementResolver =
  (direction: "receipt" | "payment", currencies: DocumentCurrencyOption[]): Resolver<SettlementFormValues> =>
  async (values) => {
    const errors: Record<string, { type: string; message: string }> = {};

    if (!values.counterpartyId || !UUID_REGEX.test(values.counterpartyId)) {
      errors.counterpartyId = {
        type: "validate",
        message: direction === "receipt" ? "Choose a customer" : "Choose a supplier",
      };
    }

    if (!values.bankAccountId || values.bankAccountId.trim().length === 0) {
      errors.bankAccountId = {
        type: "required",
        message: "Choose a Bank or Cash account",
      };
    }

    if (!values.date || !DATE_REGEX.test(values.date)) {
      errors.date = {
        type: "validate",
        message: direction === "receipt" ? "Enter a valid receipt date" : "Enter a valid payment date",
      };
    }

    const amountTrimmed = (values.amount ?? "").trim();
    const activeMinorUnit = currencies.find((c) => c.code === values.currencyCode)?.minorUnit ?? 2;
    if (!amountTrimmed) {
      errors.amount = {
        type: "validate",
        message: "Amount must be greater than zero",
      };
    } else {
      try {
        const minor = parseCurrencyAmountToMinor(amountTrimmed, activeMinorUnit, "Amount");
        if (minor <= 0) {
          errors.amount = {
            type: "validate",
            message: "Amount must be greater than zero",
          };
        }
      } catch (err) {
        errors.amount = {
          type: "validate",
          message: err instanceof Error ? err.message : "Enter a valid amount",
        };
      }
    }

    if (Object.keys(errors).length > 0) {
      return { values: {} as Record<string, never>, errors };
    }

    return { values, errors: {} };
  };

export function SettlementAllocationForm({
  direction,
  businessId,
  currency,
  counterparties,
  documents,
  bankAccounts,
  currencies,
  rates,
  initial,
  cancelHref,
  onSubmitAction,
}: SettlementAllocationFormProps) {
  const router = useRouter();
  const isReceipt = direction === "receipt";
  const { requiresApproval } = useApprovalPolicy();
  const canPost = useActionPermission("post");
  const canCreateCounterparty = useActionPermission("create", isReceipt ? "sales" : "purchases");
  const mustSubmitForApproval = requiresApproval || !canPost;
  const [counterpartyList, setCounterpartyList] = useState(counterparties);
  useEffect(() => {
    setCounterpartyList(counterparties);
  }, [counterparties]);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [quickCreateSeed, setQuickCreateSeed] = useState("");
  const [serverError, setServerError] = useState("");

  const copy = useMemo(
    () =>
      isReceipt
        ? {
            counterpartyFieldId: "customerId",
            counterpartyLabel: "Customer",
            counterpartyPlaceholder: "Choose a customer…",
            counterpartySearch: "Search customers…",
            counterpartyEmpty: "No customers found.",
            sectionTitle: "Receipt Details",
            sectionDescription:
              "Posting debits the selected Bank/Cash account and credits Accounts Receivable. Allocate across one or more open invoices, or record as an unallocated advance credit retainer.",
            bankLabel: "Deposit To (Bank / Cash Account)",
            dateLabel: "Receipt Date",
            amountLabel: "Amount Received",
            referencePlaceholder: "e.g. WIRE-98471",
            descriptionPlaceholder: "e.g. Q3 Retainer and invoice settlement",
            allocSectionTitle: "Invoice Allocations",
            allocSectionDescription:
              "Allocate payment across open invoices, or leave unallocated as an advance retainer credit.",
            chooseCounterpartyHint:
              "Please choose a customer above to view their outstanding invoices and allocate funds.",
            advanceTitle: "Pure Advance Retainer Deposit",
            advanceHint:
              "This customer has no open invoices in {currencyCode}. The full receipt amount will be credited to Accounts Receivable and held as an unallocated advance credit pool for future invoices.",
            docNumberHeader: "Invoice #",
            docTotalHeader: "Invoice Total",
            entityNoun: "invoices",
            surplusNotice: "advance deposit (credited to customer credit pool).",
            totalLabel: "Total Received",
            allocatedLabel: "Allocated to Invoices",
            surplusTitle: "Advance Deposit Surplus",
            surplusBadge: "Customer Credit Pool",
            capLabel: "Cap to balance & keep excess as Advance",
            exceedsLinePrefix: "Exceeds balance by",
            exceedsHeaderNotice: "received payment amount",
            submitLabel: "Post Receipt",
            amountMissingFifo: "Please enter a receipt amount first to auto-allocate",
            fifoTooltip: "Automatically allocates payment starting from the oldest due invoice",
            payAllTooltip: "Sets allocations and total amount to pay all open invoices in full",
          }
        : {
            counterpartyFieldId: "supplierId",
            counterpartyLabel: "Supplier",
            counterpartyPlaceholder: "Choose a supplier…",
            counterpartySearch: "Search suppliers…",
            counterpartyEmpty: "No suppliers found.",
            sectionTitle: "Payment Details",
            sectionDescription:
              "Posting debits Accounts Payable and credits the selected Bank or Cash account. Allocate across one or more open bills, or record as an unallocated vendor prepayment deposit.",
            bankLabel: "Pay From (Bank / Cash Account)",
            dateLabel: "Payment Date",
            amountLabel: "Amount Paid",
            referencePlaceholder: "e.g. WIRE-OUT-77123",
            descriptionPlaceholder: "e.g. Monthly supplier bill settlement",
            allocSectionTitle: "Purchase Bill Allocations",
            allocSectionDescription:
              "Allocate payment across open bills, or leave unallocated as a vendor prepayment credit.",
            chooseCounterpartyHint:
              "Please choose a supplier above to view their outstanding bills and allocate funds.",
            advanceTitle: "Pure Vendor Prepayment Deposit",
            advanceHint:
              "This supplier has no open bills in {currencyCode}. The full payment amount will be debited to Accounts Payable and held as an unallocated prepayment credit pool for future purchase invoices.",
            docNumberHeader: "Bill #",
            docTotalHeader: "Bill Total",
            entityNoun: "bills",
            surplusNotice: "advance prepayment (credited to supplier prepayment pool).",
            totalLabel: "Total Paid from Bank",
            allocatedLabel: "Allocated to Bills",
            surplusTitle: "Vendor Prepayment Surplus",
            surplusBadge: "Vendor Prepayment Pool",
            capLabel: "Cap to balance & keep excess as Prepayment",
            exceedsLinePrefix: "Exceeds payable balance by",
            exceedsHeaderNotice: "payment amount",
            submitLabel: "Post Payment",
            amountMissingFifo: "Please enter a payment amount first to auto-allocate",
            fifoTooltip: "Automatically allocates payment starting from the oldest due bill",
            payAllTooltip: "Sets allocations and total amount to pay all open bills in full",
          },
    [isReceipt],
  );

  const form = useForm<SettlementFormValues>({
    resolver: settlementResolver(direction, currencies),
    // Validate on submit, then live as the user corrects fields. Blur validation
    // inserted error text that shifted the Save button mid-click.
    mode: "onSubmit",
    reValidateMode: "onChange",
    defaultValues: initial,
  });

  const {
    register,
    control,
    handleSubmit,
    setError,
    setValue,
    formState: { errors, isSubmitting, isDirty, isSubmitSuccessful },
  } = form;
  useUnsavedChanges(isDirty && !isSubmitSuccessful);

  const counterpartyId = useWatch({ control, name: "counterpartyId" }) || "";
  const watchedAmount = useWatch({ control, name: "amount" }) || "";
  const currencyCode = useWatch({ control, name: "currencyCode" }) || currency;
  const exchangeRateToBase = useWatch({ control, name: "exchangeRateToBase" }) || "";
  const exchangeRateDate = useWatch({ control, name: "exchangeRateDate" }) || "";
  const exchangeRateSource = useWatch({ control, name: "exchangeRateSource" }) || "";
  const settlementDate = useWatch({ control, name: "date" }) || "";
  const rawWatchedAllocations = useWatch({ control, name: "allocations" });
  const watchedAllocations = useMemo(() => rawWatchedAllocations ?? {}, [rawWatchedAllocations]);

  const activeCurrencyOption = currencies.find((c) => c.code === currencyCode);
  const minorUnit = activeCurrencyOption?.minorUnit ?? 2;
  const amountStep = minorUnit === 0 ? "1" : `0.${"0".repeat(minorUnit - 1)}1`;
  const zeroPlaceholder = minorUnit === 0 ? "0" : `0.${"0".repeat(minorUnit)}`;

  const counterpartyOptions = useMemo<ComboboxOption[]>(
    () => counterpartyList.map((c) => ({ value: c.id, label: c.name })),
    [counterpartyList],
  );

  const bankOptions = useMemo<ComboboxOption[]>(
    () => bankAccounts.map((a) => ({ value: a.id, label: a.name })),
    [bankAccounts],
  );

  const filteredDocuments = useMemo(
    () =>
      documents.filter(
        (doc) => doc.counterpartyId === counterpartyId && doc.currencyCode === currencyCode,
      ),
    [counterpartyId, documents, currencyCode],
  );

  const { totalAmountMinor, totalAllocatedMinor, unallocatedMinor, isOverAllocated } = useMemo(
    () => computeAllocationTotals(watchedAmount, watchedAllocations, filteredDocuments, minorUnit),
    [watchedAmount, watchedAllocations, filteredDocuments, minorUnit],
  );

  function handleCounterpartyChange(newId: string) {
    setValue("counterpartyId", newId, { shouldValidate: true, shouldDirty: true });
    setValue("allocations", {}, { shouldDirty: true });

    const openForCounterparty = documents.filter((doc) => doc.counterpartyId === newId);
    if (openForCounterparty.length > 0 && openForCounterparty[0]?.currencyCode) {
      const targetCode = openForCounterparty[0].currencyCode;
      setValue("currencyCode", targetCode);
      setValue("exchangeRateToBase", targetCode === currency ? "1" : "");
      setValue("exchangeRateDate", targetCode === currency ? settlementDate : "");
      setValue("exchangeRateSource", targetCode === currency ? "Base" : "");
    }
  }

  function handlePayFull(doc: SettlementOpenDocument) {
    const fullStr = minorToCurrencyInput(doc.balanceMinor, doc.minorUnit);
    setValue(`allocations.${doc.id}`, fullStr, { shouldDirty: true });

    if (totalAmountMinor === 0) {
      setValue("amount", fullStr, { shouldValidate: true, shouldDirty: true });
    }
  }

  function handleAutoAllocateFifo() {
    if (totalAmountMinor <= 0) {
      setError("amount", { message: copy.amountMissingFifo });
      return;
    }

    const nextAllocations = allocateFifo(filteredDocuments, totalAmountMinor, currencyCode);
    setValue("allocations", nextAllocations, { shouldDirty: true });
  }

  function handlePayAllDocuments() {
    const totalOpenMinor = filteredDocuments.reduce((sum, doc) => sum + doc.balanceMinor, 0);
    if (totalOpenMinor <= 0) return;

    const nextAllocations: Record<string, string> = {};
    for (const doc of filteredDocuments) {
      nextAllocations[doc.id] = minorToCurrencyInput(doc.balanceMinor, doc.minorUnit);
    }

    setValue("allocations", nextAllocations, { shouldDirty: true });
    setValue("amount", minorToCurrencyInput(totalOpenMinor, minorUnit), {
      shouldValidate: true,
      shouldDirty: true,
    });
  }

  function handleClearAllocations() {
    setValue("allocations", {}, { shouldDirty: true });
  }

  async function submit(values: SettlementFormValues, afterSave: "view" | "new" = "view") {
    setServerError("");

    const finalAllocations: { invoiceId: string; amount: string }[] = [];
    for (const [docId, amtStr] of Object.entries(values.allocations ?? {})) {
      if (!amtStr || !amtStr.trim()) continue;
      const doc = filteredDocuments.find((item) => item.id === docId);
      if (!doc) continue;
      const docMinorUnit = doc.minorUnit ?? minorUnit;
      try {
        const minor = parseCurrencyAmountToMinor(amtStr, docMinorUnit, "Allocation");
        if (minor > 0) {
          finalAllocations.push({ invoiceId: docId, amount: amtStr.trim() });
        }
      } catch (err) {
        setServerError(err instanceof Error ? err.message : "Invalid allocation amount");
        return;
      }
    }

    const currentTotals = computeAllocationTotals(
      values.amount,
      values.allocations,
      filteredDocuments,
      minorUnit,
    );
    if (currentTotals.totalAllocatedMinor > currentTotals.totalAmountMinor) {
      setServerError(
        `Allocated total (${formatMoney(currentTotals.totalAllocatedMinor, currencyCode, minorUnit)}) exceeds ${copy.exceedsHeaderNotice} (${formatMoney(currentTotals.totalAmountMinor, currencyCode, minorUnit)}).`,
      );
      return;
    }

    const result = await onSubmitAction({
      counterpartyId: values.counterpartyId,
      bankAccountId: values.bankAccountId,
      date: values.date,
      amount: values.amount,
      reference: values.reference,
      description: values.description,
      currencyCode: values.currencyCode,
      exchangeRateToBase: values.exchangeRateToBase,
      exchangeRateDate: values.exchangeRateDate,
      exchangeRateSource: values.exchangeRateSource,
      allocations: finalAllocations,
    }, afterSave);

    if (result.fieldErrors) {
      for (const [field, messages] of Object.entries(result.fieldErrors)) {
        if (!messages?.[0]) continue;
        if (field === "customerId" || field === "supplierId") {
          setError("counterpartyId", { message: messages[0] });
        } else if (field in values) {
          setError(field as keyof SettlementFormValues, { message: messages[0] });
        }
      }
    }
    if (result.error) setServerError(result.error);
  }

  const today = getBusinessTodayIso();

  return (
    <>
    <form onSubmit={handleSubmit((v) => submit(v, "view"), focusFirstInvalidField)} className="space-y-6 pb-8" noValidate>
      {serverError && <FormError message={serverError} />}

      <section className="form-section border-b border-border pb-7">
        <h2 className="text-base font-semibold">{copy.sectionTitle}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{copy.sectionDescription}</p>

        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={copy.counterpartyFieldId}>{copy.counterpartyLabel}</Label>
            <Controller
              control={control}
              name="counterpartyId"
              render={({ field }) => (
                <Combobox ref={field.ref}
                  id={copy.counterpartyFieldId}
                  options={counterpartyOptions}
                  value={field.value ?? ""}
                  onValueChange={handleCounterpartyChange}
                  placeholder={copy.counterpartyPlaceholder}
                  searchPlaceholder={copy.counterpartySearch}
                  emptyText={copy.counterpartyEmpty}
                  allowClear
                  ariaInvalid={!!errors.counterpartyId} ariaDescribedBy={errors.counterpartyId ? fieldErrorId("counterpartyId") : undefined}
                  createAction={
                    canCreateCounterparty
                      ? {
                          label: isReceipt ? "New Customer" : "New Supplier",
                          onTrigger: (query) => {
                            setQuickCreateSeed(query);
                            setQuickCreateOpen(true);
                          },
                        }
                      : undefined
                  }
                />
              )}
            />
            <FieldError name="counterpartyId" message={errors.counterpartyId?.message} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bankAccountId">{copy.bankLabel}</Label>
            <Controller
              control={control}
              name="bankAccountId"
              render={({ field }) => (
                <Combobox ref={field.ref}
                  id="bankAccountId"
                  options={bankOptions}
                  value={field.value ?? ""}
                  onValueChange={(next) => field.onChange(next)}
                  placeholder="Choose Bank or Cash…"
                  searchPlaceholder="Search bank accounts…"
                  emptyText="No accounts found."
                  ariaInvalid={!!errors.bankAccountId} ariaDescribedBy={errors.bankAccountId ? fieldErrorId("bankAccountId") : undefined}
                />
              )}
            />
            <FieldError name="bankAccountId" message={errors.bankAccountId?.message} />
          </div>

          <DocumentCurrencyFields
            baseCurrencyCode={currency}
            currencies={currencies}
            rates={rates}
            currencyCode={currencyCode}
            exchangeRateToBase={exchangeRateToBase}
            exchangeRateDate={exchangeRateDate}
            exchangeRateSource={exchangeRateSource}
            relevantDate={settlementDate}
            lockCurrency={false}
            onChange={(field, val) => {
              if (field === "currencyCode" && val !== currencyCode) {
                setValue("allocations", {}, { shouldDirty: true });
              }
              setValue(field, val, { shouldDirty: true });
            }}
          />

          <div className="space-y-1.5">
            <Label htmlFor="date">{copy.dateLabel}</Label>
            <Input id="date" type="date" {...register("date")} {...fieldErrorProps("date", errors.date)} />
            <FieldError name="date" message={errors.date?.message} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="amount">
              {copy.amountLabel} ({currencyCode})
            </Label>
            <Input
              id="amount"
              type="number"
              min={amountStep}
              step={amountStep}
              placeholder={zeroPlaceholder}
              className="money text-right font-medium text-base tabular-nums"
              {...register("amount")}
              {...fieldErrorProps("amount", errors.amount)}
            />
            <FieldError name="amount" message={errors.amount?.message} />
            {unallocatedMinor > 0 && totalAllocatedMinor > 0 && (
              <p className="text-xs font-medium text-success">
                Includes {formatMoney(unallocatedMinor, currencyCode, minorUnit)} {copy.surplusNotice}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reference">
              Reference <span className="font-normal text-muted-foreground">(Cheque / Wire / Transfer Ref)</span>
            </Label>
            <Input id="reference" placeholder={copy.referencePlaceholder} {...register("reference")} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">
              Description <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input id="description" placeholder={copy.descriptionPlaceholder} {...register("description")} />
          </div>
        </div>
      </section>

      <section className="form-section pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold flex items-center gap-2">
              <FileText className="size-4 text-primary" /> {copy.allocSectionTitle}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{copy.allocSectionDescription}</p>
          </div>

          {counterpartyId && filteredDocuments.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleAutoAllocateFifo}
                className="text-xs"
                title={copy.fifoTooltip}
              >
                <Sparkles className="size-3.5 text-warning" /> Auto-Allocate FIFO
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handlePayAllDocuments}
                className="text-xs"
                title={copy.payAllTooltip}
              >
                <CheckCheck className="size-3.5 text-success" /> Pay All Open
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleClearAllocations}
                className="text-xs text-muted-foreground"
              >
                <RotateCcw className="size-3" /> Clear
              </Button>
            </div>
          )}
        </div>

        {!counterpartyId ? (
          <div className="mt-4 rounded-md border border-dashed border-border bg-surface-muted/30 p-6 text-center text-sm text-muted-foreground">
            {copy.chooseCounterpartyHint}
          </div>
        ) : filteredDocuments.length === 0 ? (
          <div className="mt-4 rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
            <div className="flex items-start gap-3">
              <Coins className="size-5 shrink-0 text-warning mt-0.5" />
              <div>
                <h4 className="font-semibold">{copy.advanceTitle}</h4>
                <p className="mt-0.5 text-xs">
                  {copy.advanceHint.replace("{currencyCode}", currencyCode)}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-lg border border-border">
            <table className="data-table min-w-table-lg">
              <thead>
                <tr>
                  <th>{copy.docNumberHeader}</th>
                  <th>Date</th>
                  <th>Due Date</th>
                  <th className="col-numeric">{copy.docTotalHeader}</th>
                  <th className="col-numeric">Open Balance</th>
                  <th className="col-numeric w-44">Allocate Amount</th>
                  <th className="text-center! w-24">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredDocuments.map((doc) => {
                  const currentAllocStr = watchedAllocations[doc.id] || "";
                  const isOverdue = doc.dueDate && doc.dueDate < today;
                  const currentAllocMinor = safeParseMinorAmount(currentAllocStr, doc.minorUnit);
                  const isLineOverAllocated = currentAllocMinor > doc.balanceMinor;

                  return (
                    <tr key={doc.id}>
                      <td>
                        <span className="font-medium tabular text-primary whitespace-nowrap">
                          {doc.documentNumber}
                        </span>
                      </td>
                      <td className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatDate(doc.invoiceDate)}
                      </td>
                      <td className="text-xs whitespace-nowrap">
                        {formatDate(doc.dueDate)}
                        {isOverdue && (
                          <Badge tone="danger" className="ml-2 text-[10px] py-0 px-1">
                            Overdue
                          </Badge>
                        )}
                      </td>
                      <td className="col-numeric money text-xs">
                        {formatMoney(doc.totalMinor, doc.currencyCode, doc.minorUnit)}
                      </td>
                      <td className="col-numeric money font-medium">
                        {formatMoney(doc.balanceMinor, doc.currencyCode, doc.minorUnit)}
                      </td>
                      <td className="text-right">
                        <Controller
                          control={control}
                          name={`allocations.${doc.id}`}
                          render={({ field }) => (
                            <Input ref={field.ref}
                              type="number"
                              step={doc.minorUnit === 0 ? "1" : `0.${"0".repeat(doc.minorUnit - 1)}1`}
                              min="0"
                              placeholder={doc.minorUnit === 0 ? "0" : `0.${"0".repeat(doc.minorUnit)}`}
                              aria-label={`Allocate amount for ${doc.documentNumber}`}
                              className={`money text-right h-8 text-sm tabular-nums ${
                                isLineOverAllocated
                                  ? "border-danger ring-1 ring-danger/30 text-danger font-semibold"
                                  : ""
                              }`}
                              value={field.value ?? ""}
                              onChange={(e) => field.onChange(e.target.value)}
                              onBlur={field.onBlur}
                            />
                          )}
                        />
                        {isLineOverAllocated && (
                          <div className="mt-1.5 text-[11px] text-danger flex flex-col items-end gap-1">
                            <span>
                              {copy.exceedsLinePrefix}{" "}
                              {formatMoney(
                                currentAllocMinor - doc.balanceMinor,
                                doc.currencyCode,
                                doc.minorUnit,
                              )}
                            </span>
                            <button
                              type="button"
                              className="text-[11px] font-semibold text-primary underline hover:text-primary/80 transition-colors"
                              onClick={() => {
                                setValue(
                                  `allocations.${doc.id}`,
                                  minorToCurrencyInput(doc.balanceMinor, doc.minorUnit),
                                  { shouldDirty: true },
                                );
                                if (totalAmountMinor < currentAllocMinor) {
                                  setValue("amount", currentAllocStr, {
                                    shouldValidate: true,
                                    shouldDirty: true,
                                  });
                                }
                              }}
                            >
                              {copy.capLabel}
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="text-center">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 text-xs font-normal hover:bg-primary/10 hover:text-primary"
                          onClick={() => handlePayFull(doc)}
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

        {counterpartyId && (
          <div className="mt-4 grid gap-3 sm:grid-cols-3 rounded-lg border border-border bg-surface-muted/40 p-4 text-sm">
            <div>
              <span className="text-xs text-muted-foreground block">{copy.totalLabel}</span>
              <span className="money text-base font-semibold tabular-nums">
                {formatMoney(totalAmountMinor, currencyCode, minorUnit)}
              </span>
            </div>
            <div>
              <span className="text-xs text-muted-foreground block">{copy.allocatedLabel}</span>
              <span
                className={`money text-base font-semibold tabular-nums ${
                  isOverAllocated ? "text-danger" : ""
                }`}
              >
                {formatMoney(totalAllocatedMinor, currencyCode, minorUnit)}
              </span>
            </div>
            <div>
              <span className="text-xs text-muted-foreground block">
                {unallocatedMinor > 0 ? copy.surplusTitle : "Unallocated Balance"}
              </span>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="money text-base font-semibold text-success tabular-nums">
                  {formatMoney(unallocatedMinor, currencyCode, minorUnit)}
                </span>
                {unallocatedMinor > 0 && (
                  <Badge tone="success" className="text-[10px]">
                    {copy.surplusBadge}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        )}

        {isOverAllocated && (
          <div className="mt-3 flex items-center gap-2 rounded-md border border-danger/30 bg-danger/10 p-3 text-xs text-danger">
            <AlertTriangle className="size-4 shrink-0" />
            <span>
              The total allocated across {copy.entityNoun} (
              {formatMoney(totalAllocatedMinor, currencyCode, minorUnit)}) exceeds the{" "}
              {copy.exceedsHeaderNotice} ({formatMoney(totalAmountMinor, currencyCode, minorUnit)}).
            </span>
          </div>
        )}
      </section>

      <DocumentFormFooter
        onCancel={() => router.push(cancelHref)}
        totals={{
          totalMinor: totalAmountMinor,
          currencyCode,
          minorUnit,
        }}
      >
        {mustSubmitForApproval ? (
          <Button
            permission="create"
            type="submit"
            disabled={isSubmitting || isOverAllocated}
          >
            {isSubmitting && <LoaderCircle className="size-4 animate-spin" />} Submit for Approval
          </Button>
        ) : (
          <SplitActionButton
            label={copy.submitLabel}
            permission={["create", "post"]}
            type="button"
            loading={isSubmitting}
            disabled={isOverAllocated}
            onPrimaryClick={handleSubmit((v) => submit(v, "view"), focusFirstInvalidField)}
            options={[
              {
                label: "Post & Record Another",
                description: isReceipt ? "Post this receipt and start another" : "Post this payment and start another",
                onSelect: handleSubmit((v) => submit(v, "new"), focusFirstInvalidField),
              },
            ]}
          />
        )}
      </DocumentFormFooter>
    </form>
    {isReceipt ? (
      <QuickCreateCustomerDialog
        businessId={businessId}
        open={quickCreateOpen}
        onOpenChange={setQuickCreateOpen}
        initialName={quickCreateSeed}
        defaultCurrencyCode={currencyCode || currency}
        onCreated={(created) => {
          setCounterpartyList((prev) =>
            prev.some((c) => c.id === created.id) ? prev : [...prev, { id: created.id, name: created.name }],
          );
          handleCounterpartyChange(created.id);
          if (created.defaultCurrencyCode && created.defaultCurrencyCode !== currencyCode) {
            setValue("currencyCode", created.defaultCurrencyCode);
            setValue("exchangeRateToBase", created.defaultCurrencyCode === currency ? "1" : "");
            setValue("exchangeRateDate", created.defaultCurrencyCode === currency ? settlementDate : "");
            setValue("exchangeRateSource", created.defaultCurrencyCode === currency ? "Base" : "");
          }
        }}
      />
    ) : (
      <QuickCreateSupplierDialog
        businessId={businessId}
        open={quickCreateOpen}
        onOpenChange={setQuickCreateOpen}
        initialName={quickCreateSeed}
        defaultCurrencyCode={currencyCode || currency}
        onCreated={(created) => {
          setCounterpartyList((prev) =>
            prev.some((c) => c.id === created.id) ? prev : [...prev, { id: created.id, name: created.name }],
          );
          handleCounterpartyChange(created.id);
          if (created.defaultCurrencyCode && created.defaultCurrencyCode !== currencyCode) {
            setValue("currencyCode", created.defaultCurrencyCode);
            setValue("exchangeRateToBase", created.defaultCurrencyCode === currency ? "1" : "");
            setValue("exchangeRateDate", created.defaultCurrencyCode === currency ? settlementDate : "");
            setValue("exchangeRateSource", created.defaultCurrencyCode === currency ? "Base" : "");
          }
        }}
      />
    )}
    </>
  );
}
