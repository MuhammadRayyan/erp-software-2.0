"use client";
import { useRouter } from "next/navigation";
import { FormError } from "@/components/form-error";
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Coins, LoaderCircle } from "lucide-react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { formatDate, formatMoney } from "@/core/format";
import { convertToBase, minorToCurrencyInput } from "@/modules/currency/conversion";
import { DocumentCurrencyFields, type DocumentCurrencyOption, type DocumentRateOption } from "@/modules/currency/document-currency-fields";
import { CustomFieldInputs, type CustomFieldInputDefinition } from "@/modules/custom-fields/custom-field-inputs";
import { firstMissingRequiredCustomField } from "@/modules/custom-fields/custom-field-display";
import { createInvoiceAction, updateInvoiceAction } from "./actions";
import { invoiceInputSchema, type InvoiceInput } from "./invoice-input";
import type { DocumentStatus, InvoiceSaveIntent } from "./invoice-service";
import { emirateLabels, emirates } from "@/modules/tax/uae-vat-config";
import { DocumentFormFooter } from "@/components/document-form-footer";
import { SelectNative } from "@/components/ui/select-native";
import { DocumentLineTable, useDocumentTotals } from "@/components/documents";

type CustomerOption = { id: string; name: string; defaultCurrencyCode: string | null; paymentTermsDays: number; creditLimitMinor: number | null };
type AccountOption = { id: string; name: string };
type TaxCodeOption = { id: string; name: string; rateBasisPoints: number };
type ProjectOption = { id: string; code: string; name: string; customerId: string | null };
type ItemOption = { id: string; sku: string | null; name: string; salesPriceMinor: number | null; salesAccountId: string };
type OrderOption = { id: string; orderNumber: string; customerId: string; date?: string };
type QuoteOption = { id: string; quoteNumber: string; customerId: string; date?: string };
export type CustomerCreditOption = { receiptId: string; receiptNumber: string; date: string; currencyCode: string; currencyMinorUnit: number; unallocatedAmountMinor: number };

export function InvoiceForm({
  onDefaultSave,
  businessId,
  invoiceId,
  documentStatus = "draft",
  customers,
  salesAccounts,
  taxCodes,
  projects,
  items,
  orders,
  quotes,
  currency,
  currencies,
  rates,
  initial,
  availableCustomerCredits,
  customFields = [],
  customFieldValues,
}: {
  onDefaultSave?: (values: any, customValues: Record<string, string>) => Promise<{ error?: string; fieldErrors?: any } | undefined>;
  businessId: string;
  invoiceId?: string;
  documentStatus?: DocumentStatus;
  customers: CustomerOption[];
  salesAccounts: AccountOption[];
  taxCodes: TaxCodeOption[];
  projects: ProjectOption[];
  items: ItemOption[];
  orders?: OrderOption[];
  quotes?: QuoteOption[];
  currency: string;
  currencies: DocumentCurrencyOption[];
  rates: DocumentRateOption[];
  initial: InvoiceInput;
  availableCustomerCredits?: Record<string, CustomerCreditOption[]>;
  customFields?: CustomFieldInputDefinition[];
  customFieldValues?: Record<string, string>;
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState("");
  const [customValues, setCustomValues] = useState<Record<string, string>>(() => {
    const initialCustomValues: Record<string, string> = {};
    for (const definition of customFields) {
      initialCustomValues[definition.id] = customFieldValues?.[definition.id]
        ?? (definition.fieldType === "checkbox" ? "false" : "");
    }
    return initialCustomValues;
  });
  const form = useForm<InvoiceInput>({
    resolver: zodResolver(invoiceInputSchema),
    mode: "onTouched",
    defaultValues: initial,
  });
  const { register, control, handleSubmit, setError, setValue, formState: { errors, isSubmitting } } = form;
  const { fields, append, remove, insert, move } = useFieldArray({ control, name: "lines" });
  function duplicateLine(index: number) {
    const currentLine = form.getValues(`lines.${index}`);
    insert(index + 1, { ...currentLine });
  }
  function moveLineUp(index: number) {
    if (index > 0) move(index, index - 1);
  }
  function moveLineDown(index: number) {
    if (index < fields.length - 1) move(index, index + 1);
  }
  const customerId = useWatch({ control, name: "customerId" });
  const currencyCode = useWatch({ control, name: "currencyCode" }) || currency;
  const exchangeRateToBase = useWatch({ control, name: "exchangeRateToBase" }) || "";
  const exchangeRateDate = useWatch({ control, name: "exchangeRateDate" }) || "";
  const exchangeRateSource = useWatch({ control, name: "exchangeRateSource" }) || "";
  const invoiceDate = useWatch({ control, name: "invoiceDate" }) || "";
  const taxDate = useWatch({ control, name: "taxDate" }) || invoiceDate;
  const minorUnit = currencies.find((entry) => entry.code === currencyCode)?.minorUnit ?? 2;
  const availableProjects = projects.filter((project) => {
    if (!customerId) return true;
    const cids = (project as any).customerIds as string[] | undefined;
    if (cids && cids.length > 0) return cids.includes(customerId);
    return !project.customerId || project.customerId === customerId;
  });
  const availableOrders = (orders ?? []).filter((o) => !customerId || o.customerId === customerId);
  const availableQuotes = (quotes ?? []).filter((q) => !customerId || q.customerId === customerId);
  const baseMinorUnit = currencies.find((entry) => entry.code === currency)?.minorUnit ?? 2;
  const { lines, amountsIncludeTax, previews, subtotalMinor, taxMinor } = useDocumentTotals({ control, taxCodes, minorUnit });
  const totalMinor = subtotalMinor + taxMinor;
  const applyAvailableCredit = useWatch({ control, name: "applyAvailableCredit" });
  const currentCustomerCredits = (availableCustomerCredits?.[customerId] || []).filter((c) => c.currencyCode === currencyCode);
  const totalAvailableCreditMinor = currentCustomerCredits.reduce((s, c) => s + c.unallocatedAmountMinor, 0);
  const creditAppliedMinor = (!invoiceId && applyAvailableCredit && totalAvailableCreditMinor > 0) ? Math.min(totalMinor, totalAvailableCreditMinor) : 0;

  let baseEquivalentMinor: number | null = null;
  if (currencyCode !== currency && exchangeRateToBase) {
    try { baseEquivalentMinor = convertToBase(subtotalMinor + taxMinor, minorUnit, baseMinorUnit, exchangeRateToBase); } catch { baseEquivalentMinor = null; }
  }
  const cancelHref = invoiceId ? `/b/${businessId}/sales/invoices/${invoiceId}` : `/b/${businessId}/sales/invoices`;
  const defaultSalesAccountId = salesAccounts[0]?.id ?? "";
  const defaultTaxCodeId = taxCodes.find((taxCode) => taxCode.rateBasisPoints === 500)?.id ?? taxCodes[0]?.id ?? "";
  function selectItem(index: number, itemId: string) {
    const item = items.find((entry) => entry.id === itemId);
    if (!item) { form.setValue(`lines.${index}.salesAccountId`, defaultSalesAccountId); return; }
    form.setValue(`lines.${index}.description`, item.name);
    form.setValue(`lines.${index}.unitPrice`, minorToCurrencyInput(item.salesPriceMinor ?? 0, minorUnit));
    form.setValue(`lines.${index}.salesAccountId`, item.salesAccountId);
  }

  async function save(values: InvoiceInput, intent: InvoiceSaveIntent) {
    setServerError("");
    const missingCustomField = firstMissingRequiredCustomField(customFields, customValues);
    if (missingCustomField) {
      setServerError(`"${missingCustomField}" is required.`);
      return;
    }
    
    if (onDefaultSave) {
      const result = await onDefaultSave(values, customValues);
      if (result?.fieldErrors) {
        for (const [field, messages] of Object.entries(result.fieldErrors)) {
          setError(field as keyof InvoiceInput, { message: (messages as string[])[0] });
        }
      }
      if (result?.error) setServerError(result.error);
      return;
    }

    const result = invoiceId
      ? await updateInvoiceAction(businessId, invoiceId, values, intent, customValues)
      : await createInvoiceAction(businessId, values, intent, customValues);
    if (result.fieldErrors) {
      for (const [field, messages] of Object.entries(result.fieldErrors)) {
        setError(field as keyof InvoiceInput, { message: messages[0] });
      }
    }
    if (result.error) setServerError(result.error);
  }

  return (
    <form className="space-y-5 max-w-none" noValidate>
      {serverError && <FormError message={serverError} />}
      <section className="form-section">
        <h2 className="text-base font-semibold">Invoice details</h2>
        <div className="mt-5 grid gap-5 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="customerId">Customer</Label>
            <SelectNative
              id="customerId"
              {...register("customerId", {
                onChange: (event) => {
                  const newCustomerId = event.target.value;
                  if (documentStatus === "draft") {
                    const customer = customers.find((c) => c.id === newCustomerId);
                    const code = customer?.defaultCurrencyCode ?? currency;
                    setValue("currencyCode", code);
                    setValue("exchangeRateToBase", code === currency ? "1" : "");
                    setValue("exchangeRateDate", code === currency ? (taxDate || invoiceDate) : "");
                    setValue("exchangeRateSource", code === currency ? "Base" : "");
                    if (customer?.paymentTermsDays) {
                      const baseDate = invoiceDate || new Date().toISOString().slice(0, 10);
                      const d = new Date(baseDate);
                      if (!Number.isNaN(d.valueOf())) {
                        d.setDate(d.getDate() + customer.paymentTermsDays);
                        setValue("dueDate", d.toISOString().slice(0, 10));
                      }
                    }
                  }
                },
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
            {errors.customerId && <p className="field-error">{errors.customerId.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="salesOrderId">Sales order <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <SelectNative
              id="salesOrderId"
              {...register("salesOrderId", {
                onChange: (e) => {
                  const ord = orders?.find((item) => item.id === e.target.value);
                  if (ord && !form.getValues("reference")) {
                    form.setValue("reference", `Order ${ord.orderNumber}`);
                  }
                }
              })}
            >
              <option value="">No linked sales order</option>
              {availableOrders.map((ord) => (
                <option key={ord.id} value={ord.id}>{ord.orderNumber}{ord.date ? ` — ${ord.date}` : ""}</option>
              ))}
            </SelectNative>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="quoteId">Sales quote <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <SelectNative
              id="quoteId"
              {...register("quoteId", {
                onChange: (e) => {
                  const q = quotes?.find((item) => item.id === e.target.value);
                  if (q && !form.getValues("reference")) {
                    form.setValue("reference", `Quote ${q.quoteNumber}`);
                  }
                }
              })}
            >
              <option value="">No linked quote</option>
              {availableQuotes.map((q) => (
                <option key={q.id} value={q.id}>{q.quoteNumber}{q.date ? ` — ${q.date}` : ""}</option>
              ))}
            </SelectNative>
          </div>

          {!invoiceId && totalAvailableCreditMinor > 0 && (
            <div className="md:col-span-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-sm dark:bg-emerald-950/25">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <Coins className="size-5 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
                  <div>
                    <p className="font-semibold text-emerald-900 dark:text-emerald-200">
                      Customer Advance Credit Available: {formatMoney(totalAvailableCreditMinor, currencyCode, minorUnit)}
                    </p>
                    <p className="mt-0.5 text-xs text-emerald-700 dark:text-emerald-300">
                      {currentCustomerCredits.length === 1
                        ? `Receipt ${currentCustomerCredits[0].receiptNumber} (${formatDate(currentCustomerCredits[0].date)}) has unallocated advance funds.`
                        : `${currentCustomerCredits.length} receipts have unallocated advance funds. Credit will be applied automatically upon posting.`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 cursor-pointer select-none font-medium text-emerald-900 dark:text-emerald-200">
                    <input
                      type="checkbox"
                      className="size-4 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500"
                      {...register("applyAvailableCredit")}
                    />
                    <span className="text-xs sm:text-sm">Apply credit upon posting</span>
                  </label>
                </div>
              </div>
            </div>
          )}
          <div className="space-y-1.5"><Label htmlFor="invoiceDate">Invoice date</Label><Input id="invoiceDate" type="date" {...register("invoiceDate", { onChange: (event) => { if (documentStatus === "draft") { const customer = customers.find((c) => c.id === customerId); if (customer?.paymentTermsDays && event.target.value) { const d = new Date(event.target.value); if (!Number.isNaN(d.valueOf())) { d.setDate(d.getDate() + customer.paymentTermsDays); setValue("dueDate", d.toISOString().slice(0, 10)); } } } } })} aria-invalid={!!errors.invoiceDate} />{errors.invoiceDate && <p className="field-error">{errors.invoiceDate.message}</p>}</div>
          <div className="space-y-1.5"><Label htmlFor="taxDate">VAT tax date</Label><Input id="taxDate" type="date" {...register("taxDate")} aria-invalid={!!errors.taxDate} />{errors.taxDate && <p className="field-error">{errors.taxDate.message}</p>}</div>
          <div className="space-y-1.5"><Label htmlFor="dueDate">Due date</Label><Input id="dueDate" type="date" {...register("dueDate")} aria-invalid={!!errors.dueDate} />{errors.dueDate && <p className="field-error">{errors.dueDate.message}</p>}</div>
          <div className="space-y-1.5"><Label htmlFor="supplyEmirate">Supply Emirate</Label><SelectNative id="supplyEmirate"  {...register("supplyEmirate")}><option value="">Use business default</option>{emirates.map((emirate) => <option key={emirate} value={emirate}>{emirateLabels[emirate]}</option>)}</SelectNative><p className="text-xs text-muted-foreground">Reviewed for standard-rated Sales reporting.</p></div>
          <div className="space-y-1.5"><Label htmlFor="projectId">Project <span className="font-normal text-muted-foreground">(optional)</span></Label><SelectNative id="projectId"  {...register("projectId")} aria-invalid={!!errors.projectId}><option value="">No project</option>{availableProjects.map((project) => <option key={project.id} value={project.id}>{project.code} — {project.name}</option>)}</SelectNative>{errors.projectId && <p className="field-error">{errors.projectId.message}</p>}</div>
          <div className="space-y-1.5"><Label htmlFor="reference">Reference <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="reference" {...register("reference")} /></div>
          <div className="space-y-1.5 md:col-span-3 grid md:grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <Textarea id="notes" rows={2} placeholder="Customer-facing notes..." {...register("notes")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="terms">Terms & conditions <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <Textarea id="terms" rows={2} placeholder="Payment or warranty terms..." {...register("terms")} />
            </div>
          </div>
        </div>
      </section>
      <section className="form-section">
        <h2 className="mb-4 text-base font-semibold">Document currency</h2>
        <DocumentCurrencyFields baseCurrencyCode={currency} currencies={currencies} rates={rates} currencyCode={currencyCode} exchangeRateToBase={exchangeRateToBase} exchangeRateDate={exchangeRateDate} exchangeRateSource={exchangeRateSource} relevantDate={taxDate || invoiceDate} disabled={documentStatus === "posted"} onChange={(field, value) => setValue(field, value)} />
        {currencyCode !== currency && <p className="mt-3 text-xs text-muted-foreground">UAE VAT-relevant invoices require a stored CBUAE-labelled rate for the VAT tax date. Posting preserves this exact snapshot.</p>}
      </section>
      <section className="form-section">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Line items</h2>
            <p className="mt-1 text-sm text-muted-foreground">Select an item for inventory sales, or leave it blank for a service line.</p>
          </div>
        </div>
        <DocumentLineTable
          register={register}
          errors={errors}
          fields={fields}
          lines={lines}
          onAppend={() =>
            append({
              itemId: "",
              description: "",
              quantity: "1",
              unitPrice: "0.00",
              salesAccountId: defaultSalesAccountId,
              taxCodeId: defaultTaxCodeId,
              projectId: "",
              discountType: "none",
              discountValue: "0",
            })
          }
          onRemove={remove}
          onDuplicate={duplicateLine}
          onMoveUp={moveLineUp}
          onMoveDown={moveLineDown}
          items={items}
          onItemSelect={selectItem}
          accounts={salesAccounts}
          accountFieldName="salesAccountId"
          taxCodes={taxCodes}
          projects={availableProjects}
          currencyCode={currencyCode}
          minorUnit={minorUnit}
          previews={previews}
          amountsIncludeTax={amountsIncludeTax}
          subtotalMinor={subtotalMinor}
          taxMinor={taxMinor}
          baseEquivalentMinor={baseEquivalentMinor}
          baseCurrencyCode={currency}
          baseMinorUnit={baseMinorUnit}
          registerAmountsIncludeTax={register("amountsIncludeTax")}
        />
      </section>
      {customFields.length > 0 && (
        <section className="form-section">
          <h2 className="text-base font-semibold">Custom Fields</h2>
          <p className="mt-1 text-sm text-muted-foreground">Fields defined in Settings → Custom Fields.</p>
          <CustomFieldInputs
            definitions={customFields}
            values={customValues}
            onChange={(definitionId, value) => setCustomValues((current) => ({ ...current, [definitionId]: value }))}
            className="mt-5 grid gap-5 sm:grid-cols-2"
            checkboxClassName="size-4 rounded-[4px] border-border-strong accent-primary"
          />
        </section>
      )}
      <DocumentFormFooter
        onCancel={() => router.push(cancelHref)}
        status={documentStatus}
        totals={{
          subtotalMinor,
          taxMinor,
          creditAppliedMinor,
          totalMinor,
          currencyCode,
          minorUnit,
        }}
      >
        {documentStatus === "posted" ? <Button type="button" disabled={isSubmitting} onClick={handleSubmit((values) => save(values, "post"))}>{isSubmitting && <LoaderCircle className="size-4 animate-spin" />} Update Posted Invoice</Button> : <div className="flex gap-2"><Button type="button" variant="secondary" disabled={isSubmitting} onClick={handleSubmit((values) => save(values, "draft"))}>Save Draft</Button><Button type="button" disabled={isSubmitting} onClick={handleSubmit((values) => save(values, "post"))}>{isSubmitting && <LoaderCircle className="size-4 animate-spin" />} Post Invoice</Button></div>}
      </DocumentFormFooter>
    </form>
  );
}
