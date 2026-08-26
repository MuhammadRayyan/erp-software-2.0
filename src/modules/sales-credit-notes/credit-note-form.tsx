"use client";
import { useRouter } from "next/navigation";
import { FormError } from "@/components/form-error";
import { useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Columns3, LoaderCircle, Plus, Trash2 } from "lucide-react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney } from "@/core/format";
import { parseCurrencyAmountToMinor } from "@/modules/currency/conversion";

import { saveCreditNoteAction } from "./actions";
import {
  creditNoteInputSchema,
  type CreditNoteInput,
} from "./credit-note-input";
import type { CreditNoteStatus } from "./credit-note-service";
import { emirateLabels, emirates } from "@/modules/tax/uae-vat-config";
import { creditNoteReasonCodes } from "@/modules/einvoicing/einvoice-types";
import { DocumentFormFooter } from "@/components/document-form-footer";
import { SelectNative } from "@/components/ui/select-native";

type Option = { id: string; name: string };
type AccountOption = { id: string; code: string; name: string };
type TaxOption = { id: string; name: string; rateBasisPoints: number };
type InvoiceOption = {
  id: string;
  invoiceNumber: string;
  customerId: string;
  balanceMinor: number;
  currencyCode: string;
  minorUnit: number;
  exchangeRateToBase: string;
  exchangeRateDate: string;
  exchangeRateSource: string;
};
type ProjectOption = {
  id: string;
  code: string;
  name: string;
  customerId: string | null;
};

import {
  calculateTax,
  multiplyMoneyByQuantity,
  parseQuantityToMicros,
  splitTaxInclusive,
  calculateDiscount,
} from "@/modules/accounting/calculations/money";

function previewLine(
  line: CreditNoteInput["lines"][number] | undefined,
  taxCodes: TaxOption[],
  minorUnit: number,
  amountsIncludeTax: boolean
) {
  try {
    if (!line) return { netMinor: 0, taxMinor: 0, grossMinor: 0 };
    const unitPriceMinor = parseCurrencyAmountToMinor(
      String(line.unitPrice || "0"),
      minorUnit,
      "Unit price"
    );
    const quantityMicros = parseQuantityToMicros(String(line.quantity || "0"));
    const lineTotalMinor = multiplyMoneyByQuantity(
      unitPriceMinor,
      quantityMicros
    );
    const discountMinor = calculateDiscount(
      lineTotalMinor,
      line.discountType || "none",
      String(line.discountValue || "0"),
      minorUnit
    );
    const discountedTotalMinor = lineTotalMinor - discountMinor;
    const rate = taxCodes.find((tax) => tax.id === line.taxCodeId)?.rateBasisPoints ?? 0;

    let netMinor = 0;
    let taxMinor = 0;
    let grossMinor = 0;

    if (amountsIncludeTax) {
      grossMinor = discountedTotalMinor;
      const split = splitTaxInclusive(grossMinor, rate);
      netMinor = split.netMinor;
      taxMinor = split.taxMinor;
    } else {
      netMinor = discountedTotalMinor;
      taxMinor = calculateTax(netMinor, rate);
      grossMinor = netMinor + taxMinor;
    }
    return { netMinor, taxMinor, grossMinor };
  } catch {
    return { netMinor: 0, taxMinor: 0, grossMinor: 0 };
  }
}
export function CreditNoteForm({
  businessId,
  noteId,
  documentStatus = "draft",
  customers,
  invoices,
  salesAccounts,
  taxCodes,
  projects,
  currency,
  initial,
}: {
  businessId: string;
  noteId?: string;
  documentStatus?: CreditNoteStatus;
  customers: Option[];
  invoices: InvoiceOption[];
  salesAccounts: AccountOption[];
  taxCodes: TaxOption[];
  projects: ProjectOption[];
  currency: string;
  initial: CreditNoteInput;
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState("");
  const [showLineProjects, setShowLineProjects] = useState(() =>
    initial.lines.some((line) => Boolean(line.projectId)),
  );
  const [showDiscounts, setShowDiscounts] = useState(() =>
    initial.lines.some((line) => line.discountType !== "none"),
  );
  const [showLineNumber, setShowLineNumber] = useState(true);
  const [showDescription, setShowDescription] = useState(true);
  const [globalTaxCodeId, setGlobalTaxCodeId] = useState(
    () =>
      initial.lines[0]?.taxCodeId ||
      taxCodes.find((taxCode) => taxCode.rateBasisPoints === 500)?.id ||
      taxCodes[0]?.id ||
      ""
  );
  const form = useForm<CreditNoteInput>({
    resolver: zodResolver(creditNoteInputSchema),
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
  const { fields, append, remove } = useFieldArray({ control, name: "lines" });
  const customerId = useWatch({ control, name: "customerId" });
  const invoiceId = useWatch({ control, name: "sourceInvoiceId" });
  const lines = useWatch({ control, name: "lines" }) ?? [];
  const eligibleInvoices = useMemo(
    () => invoices.filter((invoice) => invoice.customerId === customerId),
    [customerId, invoices],
  );
  const eligibleProjects = useMemo(
    () =>
      projects.filter(
        (project) => !project.customerId || project.customerId === customerId,
      ),
    [customerId, projects],
  );
  const selected = invoices.find((invoice) => invoice.id === invoiceId);
  const currencyCode =
    useWatch({ control, name: "currencyCode" }) ||
    selected?.currencyCode ||
    currency;
  const exchangeRateToBase =
    useWatch({ control, name: "exchangeRateToBase" }) ||
    selected?.exchangeRateToBase ||
    "1";
  const exchangeRateDate =
    useWatch({ control, name: "exchangeRateDate" }) ||
    selected?.exchangeRateDate ||
    "";
  const exchangeRateSource =
    useWatch({ control, name: "exchangeRateSource" }) ||
    selected?.exchangeRateSource ||
    "Base";
  const minorUnit = selected?.minorUnit ?? 2;
  const amountsIncludeTax =
    useWatch({ control, name: "amountsIncludeTax" }) ?? false;
  const previews = lines.map((line) =>
    previewLine(line, taxCodes, minorUnit, amountsIncludeTax)
  );
  const subtotalMinor = previews.reduce((sum, row) => sum + row.netMinor, 0);
  const taxMinor = previews.reduce((sum, row) => sum + row.taxMinor, 0);
  const defaultSales = salesAccounts[0]?.id ?? "";
  const defaultTax =
    taxCodes.find((item) => item.rateBasisPoints === 500)?.id ??
    taxCodes[0]?.id ??
    "";
  
  function updateGlobalTax(newTaxId: string) {
    setGlobalTaxCodeId(newTaxId);
    lines.forEach((_, i) => form.setValue(`lines.${i}.taxCodeId`, newTaxId));
  }
  
  async function save(values: CreditNoteInput, intent: "draft" | "post") {
    setServerError("");
    const result = await saveCreditNoteAction(
      businessId,
      noteId ?? null,
      values,
      intent,
    );
    if (result.fieldErrors)
      for (const [field, messages] of Object.entries(result.fieldErrors))
        setError(field as keyof CreditNoteInput, { message: messages[0] });
    if (result.error) setServerError(result.error);
  }
  const cancelHref = noteId
    ? `/b/${businessId}/sales/credit-notes/${noteId}`
    : `/b/${businessId}/sales/credit-notes`;
  return (
    <form className="space-y-7 max-w-none" noValidate>
      {serverError && <FormError message={serverError} />}
      <section className="border-b border-border pb-7">
        <h2 className="text-base font-semibold">Credit details</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          A posted credit reverses Sales and output VAT while reducing Accounts
          Receivable.
        </p>
        <div className="mt-5 grid gap-5 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="customerId">Customer</Label>
            <SelectNative
              id="customerId"
              {...register("customerId", {
                onChange: () => setValue("sourceInvoiceId", ""),
              })}
              aria-invalid={!!errors.customerId}
            >
              <option value="">Choose a customer…</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </SelectNative>
            {errors.customerId && (
              <p className="field-error">{errors.customerId.message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sourceInvoiceId">Apply to invoice</Label>
            <SelectNative
              id="sourceInvoiceId"
              {...register("sourceInvoiceId", {
                onChange: (event) => {
                  const invoice = invoices.find(
                    (entry) => entry.id === event.target.value,
                  );
                  if (!invoice) return;
                  setValue("currencyCode", invoice.currencyCode);
                  setValue("exchangeRateToBase", invoice.exchangeRateToBase);
                  setValue("exchangeRateDate", invoice.exchangeRateDate);
                  setValue(
                    "exchangeRateSource",
                    invoice.exchangeRateSource as "Base" | "Manual" | "CBUAE",
                  );
                },
              })}
              aria-invalid={!!errors.sourceInvoiceId}
            >
              <option value="">Choose a posted invoice…</option>
              {eligibleInvoices.map((invoice) => (
                <option key={invoice.id} value={invoice.id}>
                  {invoice.invoiceNumber} ·{" "}
                  {formatMoney(
                    invoice.balanceMinor,
                    invoice.currencyCode,
                    invoice.minorUnit,
                  )}{" "}
                  remaining
                </option>
              ))}
            </SelectNative>
            {selected && (
              <p className="text-xs text-muted-foreground">
                Maximum credit{" "}
                {formatMoney(
                  selected.balanceMinor,
                  selected.currencyCode,
                  selected.minorUnit,
                )}
              </p>
            )}
            {errors.sourceInvoiceId && (
              <p className="field-error">{errors.sourceInvoiceId.message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="date">Credit note date</Label>
            <Input
              id="date"
              type="date"
              {...register("date")}
              aria-invalid={!!errors.date}
            />
            {errors.date && (
              <p className="field-error">{errors.date.message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="taxDate">VAT tax date</Label>
            <Input
              id="taxDate"
              type="date"
              {...register("taxDate")}
              aria-invalid={!!errors.taxDate}
            />
            {errors.taxDate && (
              <p className="field-error">{errors.taxDate.message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="supplyEmirate">Supply Emirate</Label>
            <SelectNative id="supplyEmirate" {...register("supplyEmirate")}>
              <option value="">Use business default</option>
              {emirates.map((emirate) => (
                <option key={emirate} value={emirate}>
                  {emirateLabels[emirate]}
                </option>
              ))}
            </SelectNative>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="projectId">
              Project{" "}
              <span className="font-normal text-muted-foreground">
                (optional)
              </span>
            </Label>
            <SelectNative id="projectId" {...register("projectId")}>
              <option value="">No project</option>
              {eligibleProjects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.code} — {project.name}
                </option>
              ))}
            </SelectNative>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reference">
              Reference{" "}
              <span className="font-normal text-muted-foreground">
                (optional)
              </span>
            </Label>
            <Input id="reference" {...register("reference")} />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="reason">
              Reason{" "}
              <span className="font-normal text-muted-foreground">
                (optional)
              </span>
            </Label>
            <Input id="reason" {...register("reason")} />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="eInvoiceReasonCode">PINT-AE credit reason</Label>
            <SelectNative
              id="eInvoiceReasonCode"
              {...register("eInvoiceReasonCode")}
            >
              <option value="">Choose before eInvoice preparation</option>
              {creditNoteReasonCodes.map((reason) => (
                <option key={reason.value} value={reason.value}>
                  {reason.value} · {reason.label}
                </option>
              ))}
            </SelectNative>
          </div>
        </div>
      </section>
      <section className="border-b border-border pb-7">
        <h2 className="text-base font-semibold">Inherited currency snapshot</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          A Credit Note always uses the linked invoice currency and original
          rate, so the correction does not manufacture an FX difference.
        </p>
        <dl className="mt-4 grid gap-3 rounded-lg border border-border bg-surface-raised p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-xs text-muted-foreground">Currency</dt>
            <dd className="mt-1 font-mono font-semibold">{currencyCode}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Rate</dt>
            <dd className="money mt-1">
              1 {currencyCode} = {exchangeRateToBase} {currency}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Rate date</dt>
            <dd className="mt-1">{exchangeRateDate || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Source</dt>
            <dd className="mt-1">{exchangeRateSource}</dd>
          </div>
        </dl>
      </section>
      <details className="rounded-lg border border-border bg-surface-raised">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">
          Advanced Electronic Invoicing transaction types
        </summary>
        <div className="grid gap-3 border-t border-border p-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              {...register("eInvoiceTransactionFlags.freeTradeZone")}
            />{" "}
            Free Trade Zone
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              {...register("eInvoiceTransactionFlags.deemedSupply")}
            />{" "}
            Deemed supply
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              {...register("eInvoiceTransactionFlags.marginScheme")}
            />{" "}
            Margin scheme
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              {...register("eInvoiceTransactionFlags.summaryInvoice")}
            />{" "}
            Summary invoice
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              {...register("eInvoiceTransactionFlags.continuousSupply")}
            />{" "}
            Continuous supply
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              {...register("eInvoiceTransactionFlags.agentBilling")}
            />{" "}
            Agent billing
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              {...register("eInvoiceTransactionFlags.eCommerce")}
            />{" "}
            E-commerce
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              {...register("eInvoiceTransactionFlags.export")}
            />{" "}
            Export
          </label>
        </div>
      </details>
      
      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Credited items</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Use the original revenue, VAT, and Project allocations for a clean reversal.
            </p>
          </div>
          <div className="flex gap-2">
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">Default Tax</Label>
              <SelectNative
                className="h-8 max-w-[200px]"
                value={globalTaxCodeId}
                onChange={(e) => updateGlobalTax(e.target.value)}
              >
                {taxCodes.map((taxCode) => (
                  <option key={taxCode.id} value={taxCode.id}>
                    {taxCode.name}
                  </option>
                ))}
              </SelectNative>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="mt-5"
              onClick={() =>
                append({
                  description: "",
                  quantity: "1",
                  unitPrice: "0.00",
                  discountType: "none",
                  discountValue: "0",
                  salesAccountId: defaultSales,
                  taxCodeId: globalTaxCodeId,
                  projectId: "",
                })
              }
            >
              <Plus className="size-4" /> Add line
            </Button>
          </div>
        </div>
        {typeof errors.lines?.message === "string" && (
          <p className="field-error mb-2">{errors.lines.message}</p>
        )}
        <div className="overflow-x-auto rounded-t-lg border border-border bg-surface-raised">
          <table className="data-table min-w-max">
            <thead>
              <tr>
                {showLineNumber && <th className="w-12 text-center text-muted-foreground">#</th>}
                {showDescription && (
                  <th className="min-w-[200px] py-3 text-left font-semibold text-muted-foreground">
                    Description
                  </th>
                )}
                <th className="min-w-[100px] py-3 text-right font-semibold text-muted-foreground">
                  Qty
                </th>
                <th className="min-w-[120px] py-3 text-right font-semibold text-muted-foreground">
                  Rate
                </th>
                {showDiscounts && (
                  <th className="min-w-[140px] py-3 text-right font-semibold text-muted-foreground">
                    Discount
                  </th>
                )}
                <th className="min-w-[150px] py-3 text-left font-semibold text-muted-foreground">
                  Sales account
                </th>
                <th className="min-w-[120px] py-3 text-left font-semibold text-muted-foreground">
                  Tax code
                </th>
                {showLineProjects && (
                  <th className="min-w-[150px] py-3 text-left font-semibold text-muted-foreground">
                    Project override
                  </th>
                )}
                {!amountsIncludeTax && (
                  <>
                    <th className="min-w-[100px] py-3 text-right font-semibold text-muted-foreground">
                      Amount
                    </th>
                    <th className="min-w-[100px] py-3 text-right font-semibold text-muted-foreground">
                      Tax
                    </th>
                  </>
                )}
                <th className="min-w-[120px] py-3 text-right font-semibold text-muted-foreground">
                  Total
                </th>
                <th className="w-12 py-3">
                  <span className="sr-only">Remove</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {fields.map((field, index) => (
                <tr key={field.id} className="hover:bg-transparent!">
                  {showLineNumber && (
                    <td className="py-2 text-center text-muted-foreground">
                      {index + 1}
                    </td>
                  )}
                  {showDescription && (
                    <td className="py-2">
                      <Input
                        aria-label={`Line ${index + 1} description`}
                        {...register(`lines.${index}.description`)}
                      />
                      {errors.lines?.[index]?.description && (
                        <p className="field-error">
                          {errors.lines[index]?.description?.message}
                        </p>
                      )}
                    </td>
                  )}
                  <td className="py-2">
                    <Input
                      className="money text-right"
                      type="number"
                      step="0.0001"
                      min="0.0001"
                      aria-label={`Line ${index + 1} quantity`}
                      {...register(`lines.${index}.quantity`)}
                    />
                  </td>
                  <td className="py-2">
                    <Input
                      className="money text-right"
                      type="number"
                      step="0.000001"
                      min="0"
                      aria-label={`Line ${index + 1} rate`}
                      {...register(`lines.${index}.unitPrice`)}
                    />
                  </td>
                  {showDiscounts && (
                    <td className="py-2">
                      <div className="flex rounded-md shadow-sm">
                        <select
                          className="-mr-px rounded-l-md border border-input bg-transparent px-2 text-sm text-muted-foreground focus:ring-1 focus:ring-ring focus:outline-none"
                          {...register(`lines.${index}.discountType`)}
                          aria-label={`Line ${index + 1} discount type`}
                        >
                          <option value="none">None</option>
                          <option value="percentage">%</option>
                          <option value="fixed">Fixed</option>
                        </select>
                        <Input
                          className="money min-w-[60px] rounded-l-none text-right"
                          type="number"
                          step={lines[index]?.discountType === "percentage" ? "1" : "0.01"}
                          min="0"
                          disabled={lines[index]?.discountType === "none" || !lines[index]?.discountType}
                          aria-label={`Line ${index + 1} discount value`}
                          {...register(`lines.${index}.discountValue`)}
                        />
                      </div>
                    </td>
                  )}
                  <td className="py-2">
                    <select
                      aria-label={`Line ${index + 1} sales account`}
                      className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                      {...register(`lines.${index}.salesAccountId`)}
                    >
                      <option value="">Choose an account...</option>
                      {salesAccounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.code} - {account.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2">
                    <select
                      aria-label={`Line ${index + 1} tax code`}
                      className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                      {...register(`lines.${index}.taxCodeId`)}
                    >
                      {taxCodes.map((taxCode) => (
                        <option key={taxCode.id} value={taxCode.id}>
                          {taxCode.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  {showLineProjects && (
                    <td className="py-2">
                      <select
                        aria-label={`Line ${index + 1} project`}
                        className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                        {...register(`lines.${index}.projectId`)}
                      >
                        <option value="">Use doc Project</option>
                        {eligibleProjects.map((project) => (
                          <option key={project.id} value={project.id}>
                            {project.code} - {project.name}
                          </option>
                        ))}
                      </select>
                    </td>
                  )}
                  {!amountsIncludeTax && (
                    <>
                      <td className="py-2 text-right font-medium">
                        {formatMoney(
                          previews[index]?.netMinor ?? 0,
                          currencyCode,
                          minorUnit
                        )}
                      </td>
                      <td className="py-2 text-right font-medium text-muted-foreground">
                        {formatMoney(
                          previews[index]?.taxMinor ?? 0,
                          currencyCode,
                          minorUnit
                        )}
                      </td>
                    </>
                  )}
                  <td className="py-2 text-right font-bold">
                    {formatMoney(
                      previews[index]?.grossMinor ?? 0,
                      currencyCode,
                      minorUnit
                    )}
                  </td>
                  <td className="py-2 text-center">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={`Remove line ${index + 1}`}
                      disabled={fields.length === 1}
                      title={
                        fields.length === 1
                          ? "A credit note needs at least one line"
                          : undefined
                      }
                      onClick={() => remove(index)}
                    >
                      <Trash2 className="size-4 text-muted-foreground" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col-reverse justify-between gap-6 rounded-b-lg border border-t-0 border-border bg-surface-raised p-4 md:flex-row">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={showLineNumber}
                onChange={(e) => setShowLineNumber(e.target.checked)}
              />{" "}
              Line number
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={showDescription}
                onChange={(e) => setShowDescription(e.target.checked)}
              />{" "}
              Description
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={showDiscounts}
                onChange={(e) => setShowDiscounts(e.target.checked)}
              />{" "}
              Discount
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={showLineProjects}
                onChange={(e) => setShowLineProjects(e.target.checked)}
              />{" "}
              Project
            </label>
            <label className="flex items-center gap-2 text-sm font-medium text-foreground">
              <input type="checkbox" {...register("amountsIncludeTax")} />{" "}
              Amounts are tax inclusive
            </label>
          </div>
          <dl className="w-full max-w-xs space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="money">
                {formatMoney(subtotalMinor, currencyCode, minorUnit)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">VAT</dt>
              <dd className="money">
                {formatMoney(taxMinor, currencyCode, minorUnit)}
              </dd>
            </div>
            <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
              <dt>Total</dt>
              <dd className="money">
                {formatMoney(subtotalMinor + taxMinor, currencyCode, minorUnit)}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <DocumentFormFooter onCancel={() => router.push(cancelHref)}>
        {documentStatus === "posted" ? (
          <Button
            type="button"
            disabled={isSubmitting}
            onClick={handleSubmit((values) => save(values, "post"))}
          >
            {isSubmitting && <LoaderCircle className="size-4 animate-spin" />}{" "}
            Update Posted Credit
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={isSubmitting}
              onClick={handleSubmit((values) => save(values, "draft"))}
            >
              Save Draft
            </Button>
            <Button
              type="button"
              disabled={isSubmitting}
              onClick={handleSubmit((values) => save(values, "post"))}
            >
              {isSubmitting && <LoaderCircle className="size-4 animate-spin" />}{" "}
              Post Credit Note
            </Button>
          </div>
        )}
      </DocumentFormFooter>
    </form>
  );
}
