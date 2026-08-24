"use client";
import { useRouter } from "next/navigation";
import { FormError } from "@/components/form-error";
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Columns3, LoaderCircle, Plus, Trash2 } from "lucide-react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney } from "@/core/format";
import { convertToBase, minorToCurrencyInput, parseCurrencyAmountToMinor } from "@/modules/currency/conversion";
import { calculateTax, multiplyMoneyByQuantity, parseQuantityToMicros } from "@/modules/accounting/calculations/money";
import { DocumentCurrencyFields, type DocumentCurrencyOption, type DocumentRateOption } from "@/modules/currency/document-currency-fields";
import { CustomFieldInputs, type CustomFieldInputDefinition } from "@/modules/custom-fields/custom-field-inputs";
import { firstMissingRequiredCustomField } from "@/modules/custom-fields/custom-field-display";
import { createInvoiceAction, updateInvoiceAction } from "./actions";
import { invoiceInputSchema, type InvoiceInput } from "./invoice-input";
import type { DocumentStatus, InvoiceSaveIntent } from "./invoice-service";
import { emirateLabels, emirates } from "@/modules/tax/uae-vat-config";
import { DocumentFormFooter } from "@/components/document-form-footer";
import { SelectNative } from "@/components/ui/select-native";

type CustomerOption = { id: string; name: string; defaultCurrencyCode: string | null };
type AccountOption = { id: string; code: string; name: string };
type TaxCodeOption = { id: string; name: string; rateBasisPoints: number };
type ProjectOption = { id: string; code: string; name: string; customerId: string | null };
type ItemOption = { id: string; sku: string | null; name: string; salesPriceMinor: number | null; salesAccountId: string };


function previewLine(line: InvoiceInput["lines"][number] | undefined, taxCodes: TaxCodeOption[], minorUnit: number) {
  try {
    const unitPriceMinor = parseCurrencyAmountToMinor(String(line?.unitPrice || "0"), minorUnit, "Unit price");
    const quantityMicros = parseQuantityToMicros(String(line?.quantity || "0"));
    const netMinor = multiplyMoneyByQuantity(unitPriceMinor, quantityMicros);
    const rate = taxCodes.find((taxCode) => taxCode.id === line?.taxCodeId)?.rateBasisPoints ?? 0;
    const taxMinor = calculateTax(netMinor, rate);
    return { netMinor, taxMinor, grossMinor: netMinor + taxMinor };
  } catch { return { netMinor: 0, taxMinor: 0, grossMinor: 0 }; }
}

export function InvoiceForm({
  businessId,
  invoiceId,
  documentStatus = "draft",
  customers,
  salesAccounts,
  taxCodes,
  projects,
  items,
  currency,
  currencies,
  rates,
  initial,
  customFields = [],
  customFieldValues,
}: {
  businessId: string;
  invoiceId?: string;
  documentStatus?: DocumentStatus;
  customers: CustomerOption[];
  salesAccounts: AccountOption[];
  taxCodes: TaxCodeOption[];
  projects: ProjectOption[];
  items: ItemOption[];
  currency: string;
  currencies: DocumentCurrencyOption[];
  rates: DocumentRateOption[];
  initial: InvoiceInput;
  customFields?: CustomFieldInputDefinition[];
  customFieldValues?: Record<string, string>;
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState("");
  const [showLineProjects, setShowLineProjects] = useState(() => initial.lines.some((line) => Boolean(line.projectId)));
  const [customValues, setCustomValues] = useState<Record<string, string>>(() => {
    const initialCustomValues: Record<string, string> = {};
    for (const definition of customFields) {
      initialCustomValues[definition.id] = customFieldValues?.[definition.id]
        ?? (definition.fieldType === "checkbox" ? "false" : "");
    }
    return initialCustomValues;
  });
  const form = useForm<InvoiceInput>({ resolver: zodResolver(invoiceInputSchema), defaultValues: initial });
  const { register, control, handleSubmit, setError, setValue, formState: { errors, isSubmitting } } = form;
  const { fields, append, remove } = useFieldArray({ control, name: "lines" });
  const lines = useWatch({ control, name: "lines" }) ?? [];
  const customerId = useWatch({ control, name: "customerId" });
  const currencyCode = useWatch({ control, name: "currencyCode" }) || currency;
  const exchangeRateToBase = useWatch({ control, name: "exchangeRateToBase" }) || "";
  const exchangeRateDate = useWatch({ control, name: "exchangeRateDate" }) || "";
  const exchangeRateSource = useWatch({ control, name: "exchangeRateSource" }) || "";
  const invoiceDate = useWatch({ control, name: "invoiceDate" }) || "";
  const taxDate = useWatch({ control, name: "taxDate" }) || invoiceDate;
  const availableProjects = projects.filter((project) => !project.customerId || project.customerId === customerId);
  const minorUnit = currencies.find((entry) => entry.code === currencyCode)?.minorUnit ?? 2;
  const baseMinorUnit = currencies.find((entry) => entry.code === currency)?.minorUnit ?? 2;
  const previews = lines.map((line) => previewLine(line, taxCodes, minorUnit));
  const subtotalMinor = previews.reduce((sum, line) => sum + line.netMinor, 0);
  const taxMinor = previews.reduce((sum, line) => sum + line.taxMinor, 0);
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
    <form className="space-y-7" noValidate>
      {serverError && <FormError message={serverError} />}
      <section className="border-b border-border pb-7">
        <h2 className="text-base font-semibold">Invoice details</h2>
        <div className="mt-5 grid gap-5 md:grid-cols-3">
          <div className="space-y-1.5"><Label htmlFor="customerId">Customer</Label><SelectNative id="customerId"  {...register("customerId", { onChange: (event) => { if (documentStatus === "draft") { const code = customers.find((customer) => customer.id === event.target.value)?.defaultCurrencyCode ?? currency; setValue("currencyCode", code); setValue("exchangeRateToBase", code === currency ? "1" : ""); setValue("exchangeRateDate", code === currency ? (taxDate || invoiceDate) : ""); setValue("exchangeRateSource", code === currency ? "Base" : ""); } } })} aria-invalid={!!errors.customerId}><option value="">Choose a customer…</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</SelectNative>{errors.customerId && <p className="field-error">{errors.customerId.message}</p>}</div>
          <div className="space-y-1.5"><Label htmlFor="invoiceDate">Invoice date</Label><Input id="invoiceDate" type="date" {...register("invoiceDate")} aria-invalid={!!errors.invoiceDate} />{errors.invoiceDate && <p className="field-error">{errors.invoiceDate.message}</p>}</div>
          <div className="space-y-1.5"><Label htmlFor="taxDate">VAT tax date</Label><Input id="taxDate" type="date" {...register("taxDate")} aria-invalid={!!errors.taxDate} />{errors.taxDate && <p className="field-error">{errors.taxDate.message}</p>}</div>
          <div className="space-y-1.5"><Label htmlFor="dueDate">Due date</Label><Input id="dueDate" type="date" {...register("dueDate")} aria-invalid={!!errors.dueDate} />{errors.dueDate && <p className="field-error">{errors.dueDate.message}</p>}</div>
          <div className="space-y-1.5"><Label htmlFor="supplyEmirate">Supply Emirate</Label><SelectNative id="supplyEmirate"  {...register("supplyEmirate")}><option value="">Use business default</option>{emirates.map((emirate) => <option key={emirate} value={emirate}>{emirateLabels[emirate]}</option>)}</SelectNative><p className="text-xs text-muted-foreground">Reviewed for standard-rated Sales reporting.</p></div>
          <div className="space-y-1.5"><Label htmlFor="projectId">Project <span className="font-normal text-muted-foreground">(optional)</span></Label><SelectNative id="projectId"  {...register("projectId")} aria-invalid={!!errors.projectId}><option value="">No project</option>{availableProjects.map((project) => <option key={project.id} value={project.id}>{project.code} — {project.name}</option>)}</SelectNative>{errors.projectId && <p className="field-error">{errors.projectId.message}</p>}</div>
          <div className="space-y-1.5 md:col-span-2"><Label htmlFor="reference">Reference <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="reference" {...register("reference")} /></div>
        </div>
      </section>
      <section className="border-b border-border pb-7">
        <h2 className="mb-4 text-base font-semibold">Document currency</h2>
        <DocumentCurrencyFields baseCurrencyCode={currency} currencies={currencies} rates={rates} currencyCode={currencyCode} exchangeRateToBase={exchangeRateToBase} exchangeRateDate={exchangeRateDate} exchangeRateSource={exchangeRateSource} relevantDate={taxDate || invoiceDate} disabled={documentStatus === "posted"} onChange={(field, value) => setValue(field, value)} />
        {currencyCode !== currency && <p className="mt-3 text-xs text-muted-foreground">UAE VAT-relevant invoices require a stored CBUAE-labelled rate for the VAT tax date. Posting preserves this exact snapshot.</p>}
      </section>
      <details className="rounded-lg border border-border bg-surface-raised">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">Advanced Electronic Invoicing transaction types</summary>
        <div className="border-t border-border p-4">
          <p className="mb-4 text-sm text-muted-foreground">These flags form the eight-character PINT-AE Profile Execution ID. Phase 7 validates the standard 00000000 subset; flagged scenarios are retained but reported as unsupported.</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" {...register("eInvoiceTransactionFlags.freeTradeZone")} /> Free Trade Zone</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" {...register("eInvoiceTransactionFlags.deemedSupply")} /> Deemed supply</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" {...register("eInvoiceTransactionFlags.marginScheme")} /> Margin scheme</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" {...register("eInvoiceTransactionFlags.summaryInvoice")} /> Summary invoice</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" {...register("eInvoiceTransactionFlags.continuousSupply")} /> Continuous supply</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" {...register("eInvoiceTransactionFlags.agentBilling")} /> Agent billing</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" {...register("eInvoiceTransactionFlags.eCommerce")} /> E-commerce</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" {...register("eInvoiceTransactionFlags.export")} /> Export</label>
          </div>
        </div>
      </details>
      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-base font-semibold">Line items</h2><p className="mt-1 text-sm text-muted-foreground">Select an item for inventory sales, or leave it blank for a service line.</p></div><div className="flex gap-2"><Button type="button" variant="ghost" size="sm" onClick={() => setShowLineProjects((value) => !value)} aria-pressed={showLineProjects}><Columns3 className="size-4" /> {showLineProjects ? "Hide line Projects" : "Show Project per line"}</Button><Button type="button" variant="secondary" size="sm" onClick={() => append({ itemId: "", description: "", quantity: "1", unitPrice: "0.00", salesAccountId: defaultSalesAccountId, taxCodeId: defaultTaxCodeId, projectId: "" })}><Plus className="size-4" /> Add line</Button></div></div>
        {typeof errors.lines?.message === "string" && <p className="field-error mb-2">{errors.lines.message}</p>}
        <div className="overflow-x-auto rounded-lg border border-border bg-surface-raised">
          <table className={`data-table ${showLineProjects ? "min-w-[1480px]" : "min-w-[1270px]"}`}>
            <thead><tr><th className="w-56">Item <span className="font-normal text-muted-foreground">(optional)</span></th><th className="min-w-[250px]">Description</th><th className="w-24 text-right!">Qty</th><th className="w-32 text-right!">Rate</th><th className="w-48">Account</th><th className="w-40">VAT</th>{showLineProjects && <th className="w-52">Project override</th>}<th className="w-32 text-right!">Amount</th><th className="w-12"><span className="sr-only">Remove</span></th></tr></thead>
            <tbody>{fields.map((field, index) => <tr key={field.id} className="hover:bg-transparent!"><td><SelectNative  aria-label={`Line ${index + 1} inventory item`} {...register(`lines.${index}.itemId`, { onChange: (event) => selectItem(index, event.target.value) })}><option value="">Service / free text</option>{items.map((item) => <option key={item.id} value={item.id}>{item.sku ? `${item.sku} — ` : ""}{item.name}</option>)}</SelectNative></td><td className="py-2"><Input aria-label={`Line ${index + 1} description`} {...register(`lines.${index}.description`)} />{errors.lines?.[index]?.description && <p className="field-error">{errors.lines[index]?.description?.message}</p>}</td><td className="py-2"><Input className="money text-right" type="number" step="0.0001" min="0.0001" aria-label={`Line ${index + 1} quantity`} {...register(`lines.${index}.quantity`)} /></td><td className="py-2"><Input className="money text-right" type="number" step="0.000001" min="0" aria-label={`Line ${index + 1} rate`} {...register(`lines.${index}.unitPrice`)} /></td><td className="py-2">{lines[index]?.itemId ? <><input type="hidden" {...register(`lines.${index}.salesAccountId`)} /><span className="text-sm text-muted-foreground">From item</span></> : <SelectNative  aria-label={`Line ${index + 1} sales account`} {...register(`lines.${index}.salesAccountId`)}>{salesAccounts.map((account) => <option key={account.id} value={account.id}>{account.code} {account.name}</option>)}</SelectNative>}</td><td className="py-2"><SelectNative  aria-label={`Line ${index + 1} tax code`} {...register(`lines.${index}.taxCodeId`)}>{taxCodes.map((taxCode) => <option key={taxCode.id} value={taxCode.id}>{taxCode.name}</option>)}</SelectNative></td>{showLineProjects && <td className="py-2"><SelectNative  aria-label={`Line ${index + 1} project override`} {...register(`lines.${index}.projectId`)}><option value="">Use document Project</option>{availableProjects.map((project) => <option key={project.id} value={project.id}>{project.code} — {project.name}</option>)}</SelectNative></td>}<td className="money text-right">{formatMoney(previews[index]?.grossMinor ?? 0, currencyCode, minorUnit)}</td><td><Button type="button" variant="ghost" size="icon" aria-label={`Remove line ${index + 1}`} disabled={fields.length === 1} title={fields.length === 1 ? "An invoice needs at least one line" : undefined} onClick={() => remove(index)}><Trash2 className="size-4 text-muted-foreground" /></Button></td></tr>)}</tbody>
          </table>
        </div>
        <dl className="mt-5 ml-auto w-full max-w-xs space-y-2 text-sm"><div className="flex justify-between"><dt className="text-muted-foreground">Subtotal</dt><dd className="money">{formatMoney(subtotalMinor, currencyCode, minorUnit)}</dd></div><div className="flex justify-between"><dt className="text-muted-foreground">VAT</dt><dd className="money">{formatMoney(taxMinor, currencyCode, minorUnit)}</dd></div><div className="flex justify-between border-t border-border pt-2 text-base font-semibold"><dt>Total</dt><dd className="money">{formatMoney(subtotalMinor + taxMinor, currencyCode, minorUnit)}</dd></div>{baseEquivalentMinor != null && <div className="flex justify-between border-t border-border pt-2"><dt className="text-muted-foreground">Base equivalent</dt><dd className="money">{formatMoney(baseEquivalentMinor, currency, baseMinorUnit)}</dd></div>}</dl>
      </section>
      {customFields.length > 0 && (
        <section className="border-b border-border pb-7">
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
      <DocumentFormFooter onCancel={() => router.push(cancelHref)}>
        {documentStatus === "posted" ? <Button type="button" disabled={isSubmitting} onClick={handleSubmit((values) => save(values, "post"))}>{isSubmitting && <LoaderCircle className="size-4 animate-spin" />} Update Posted Invoice</Button> : <div className="flex gap-2"><Button type="button" variant="secondary" disabled={isSubmitting} onClick={handleSubmit((values) => save(values, "draft"))}>Save Draft</Button><Button type="button" disabled={isSubmitting} onClick={handleSubmit((values) => save(values, "post"))}>{isSubmitting && <LoaderCircle className="size-4 animate-spin" />} Post Invoice</Button></div>}
      </DocumentFormFooter>
    </form>
  );
}
