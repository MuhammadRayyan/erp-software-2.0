"use client";
import { useRouter } from "next/navigation";
import { FormError } from "@/components/form-error";
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { formatMoney } from "@/core/format";
import { saveSalesOrderAction } from "./actions";
import { salesOrderInputSchema, type SalesOrderInput } from "./sales-order-input";
import type { SalesOrderStatus } from "./sales-order-service";
import { DocumentCurrencyFields, type DocumentCurrencyOption, type DocumentRateOption } from "@/modules/currency/document-currency-fields";
import { DocumentFormFooter } from "@/components/document-form-footer";
import { SelectNative } from "@/components/ui/select-native";
import { DocumentLineTable, useDocumentTotals } from "@/components/documents";

type Option = { id: string; name: string; defaultCurrencyCode: string | null };
type AccountOption = { id: string; name: string };
type TaxOption = { id: string; name: string; rateBasisPoints: number };
type ProjectOption = { id: string; code: string; name: string; customerId?: string | null; customerIds?: string[] };
type ItemOption = { id: string; sku: string | null; name: string; salesPriceMinor: number | null; salesAccountId: string };

export function SalesOrderForm({ businessId, orderId, status = "draft", customers, expenseAccounts, taxCodes, projects, items, currency, currencies, rates, initial }: { businessId: string; orderId?: string; status?: SalesOrderStatus; customers: Option[]; expenseAccounts: AccountOption[]; taxCodes: TaxOption[]; projects: ProjectOption[]; items: ItemOption[]; currency: string; currencies: DocumentCurrencyOption[]; rates: DocumentRateOption[]; initial: SalesOrderInput }) {
  const router = useRouter();
  const [serverError, setServerError] = useState("");
  const [globalTaxCodeId, setGlobalTaxCodeId] = useState(() => initial.lines[0]?.taxCodeId || taxCodes.find((taxCode) => taxCode.rateBasisPoints === 500)?.id || taxCodes[0]?.id || "");
  const form = useForm<SalesOrderInput>({ resolver: zodResolver(salesOrderInputSchema), defaultValues: initial });
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
  const currencyCode = useWatch({ control, name: "currencyCode" }) || currency;
  const exchangeRateToBase = useWatch({ control, name: "exchangeRateToBase" }) || "";
  const exchangeRateDate = useWatch({ control, name: "exchangeRateDate" }) || "";
  const exchangeRateSource = useWatch({ control, name: "exchangeRateSource" }) || "";
  const orderDate = useWatch({ control, name: "date" }) || "";
  const minorUnit = currencies.find((entry) => entry.code === currencyCode)?.minorUnit ?? 2;
  const { lines, amountsIncludeTax, previews, subtotalMinor, taxMinor } = useDocumentTotals({ control, taxCodes, minorUnit });
  const customerId = useWatch({ control, name: "customerId" });
  const availableProjects = projects.filter((project) => {
    if (!customerId) return true;
    const cids = (project as any).customerIds as string[] | undefined;
    if (cids && cids.length > 0) return cids.includes(customerId);
    return !project.customerId || project.customerId === customerId;
  });
  function updateGlobalTax(newTaxId: string) {
    setGlobalTaxCodeId(newTaxId);
    lines.forEach((_, i) => form.setValue(`lines.${i}.taxCodeId`, newTaxId));
  }

  const defaultExpense = expenseAccounts[0]?.id ?? "";
  function selectItem(index: number, itemId: string) {
    const item = items.find((i) => i.id === itemId);
    if (!item) {
      form.setValue(`lines.${index}.salesAccountId`, defaultExpense);
      return;
    }
    form.setValue(`lines.${index}.description`, item.name);
    if (item.salesPriceMinor != null) {
      form.setValue(`lines.${index}.unitPrice`, formatMoney(item.salesPriceMinor, currency, minorUnit).replace(/[^0-9.]/g, ""));
    }
    if (item.salesAccountId) {
      form.setValue(`lines.${index}.salesAccountId`, item.salesAccountId);
    }
  }
  async function save(values: SalesOrderInput, intent: "draft" | "issue") {
    setServerError("");
    const result = await saveSalesOrderAction(businessId, orderId ?? null, values, intent);
    if (result.fieldErrors) for (const [field, messages] of Object.entries(result.fieldErrors)) setError(field as keyof SalesOrderInput, { message: messages[0] });
    if (result.error) setServerError(result.error);
  }
  const cancelHref = orderId ? `/b/${businessId}/sales/orders/${orderId}` : `/b/${businessId}/sales/orders`;
  return <form className="space-y-5 max-w-none" noValidate>
    <input type="hidden" {...register("salesQuoteId")} />
    {serverError && <FormError message={serverError} />}
    <section className="form-section"><h2 className="text-base font-semibold">Order details</h2><p className="mt-1 text-sm text-muted-foreground">Sales orders are operational documents and never post to the ledger.</p><div className="mt-5 grid gap-5 md:grid-cols-3">
      <div className="space-y-1.5"><Label htmlFor="customerId">Customer</Label><SelectNative id="customerId"  {...register("customerId", { onChange: (event) => { if (status === "draft") { const code = customers.find((customer) => customer.id === event.target.value)?.defaultCurrencyCode ?? currency; setValue("currencyCode", code); setValue("exchangeRateToBase", code === currency ? "1" : ""); setValue("exchangeRateDate", code === currency ? orderDate : ""); setValue("exchangeRateSource", code === currency ? "Base" : ""); } } })} aria-invalid={!!errors.customerId}><option value="">Choose a customer…</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</SelectNative>{errors.customerId && <p className="field-error">{errors.customerId.message}</p>}</div>
      <div className="space-y-1.5"><Label htmlFor="date">Order date</Label><Input id="date" type="date" {...register("date")} aria-invalid={!!errors.date} />{errors.date && <p className="field-error">{errors.date.message}</p>}</div>
      <div className="space-y-1.5"><Label htmlFor="expectedDate">Expected date <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="expectedDate" type="date" {...register("expectedDate")} /></div>
      <div className="space-y-1.5"><Label htmlFor="projectId">Project <span className="font-normal text-muted-foreground">(optional)</span></Label><SelectNative id="projectId"  {...register("projectId")}><option value="">No project</option>{availableProjects.map((project) => <option key={project.id} value={project.id}>{project.code} — {project.name}</option>)}</SelectNative></div>
      <div className="space-y-1.5"><Label htmlFor="reference">Reference <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="reference" {...register("reference")} /></div>
      <div className="space-y-1.5 md:col-span-3 grid md:grid-cols-2 gap-5">
        <div className="space-y-1.5">
          <Label htmlFor="notes">Notes <span className="font-normal text-muted-foreground">(optional)</span></Label>
          <Textarea id="notes" rows={2} placeholder="Notes for customer..." {...register("notes")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="terms">Terms & conditions <span className="font-normal text-muted-foreground">(optional)</span></Label>
          <Textarea id="terms" rows={2} placeholder="Order delivery and payment terms..." {...register("terms")} />
        </div>
      </div>
    </div></section>
    <section className="form-section"><h2 className="mb-4 text-base font-semibold">Commitment currency</h2><DocumentCurrencyFields baseCurrencyCode={currency} currencies={currencies} rates={rates} currencyCode={currencyCode} exchangeRateToBase={exchangeRateToBase} exchangeRateDate={exchangeRateDate} exchangeRateSource={exchangeRateSource} relevantDate={orderDate} disabled={status === "active"} onChange={(field, value) => setValue(field, value)} /><p className="mt-3 text-xs text-muted-foreground">This is an operational commitment snapshot only. A later Purchase Invoice uses its own posting and VAT rate.</p></section>
    <section className="form-section">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Line items</h2>
          <p className="mt-1 text-sm text-muted-foreground">Select an item for inventory sales, or leave it blank for a service line.</p>
        </div>
        <div className="flex gap-4 items-center">
          <div className="flex items-center gap-2">
            <label htmlFor="globalTax" className="text-sm font-medium">Default Tax:</label>
            <select
              id="globalTax"
              className="w-40 flex h-9 items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              value={globalTaxCodeId}
              onChange={(e) => updateGlobalTax(e.target.value)}
            >
              {taxCodes.map((taxCode) => (
                <option key={taxCode.id} value={taxCode.id}>
                  {taxCode.name}
                </option>
              ))}
            </select>
          </div>
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
            discountType: "none",
            discountValue: "0",
            salesAccountId: defaultExpense,
            taxCodeId: globalTaxCodeId,
            projectId: "",
          })
        }
        onRemove={remove}
        onDuplicate={duplicateLine}
        onMoveUp={moveLineUp}
        onMoveDown={moveLineDown}
        items={items}
        onItemSelect={selectItem}
        accounts={expenseAccounts}
        accountFieldName="salesAccountId"
        accountAriaLabel="sales account"
        taxCodes={taxCodes}
        initialShowLineTaxCodes={false}
        projects={availableProjects}
        currencyCode={currencyCode}
        minorUnit={minorUnit}
        previews={previews}
        amountsIncludeTax={amountsIncludeTax}
        subtotalMinor={subtotalMinor}
        taxMinor={taxMinor}
        registerAmountsIncludeTax={register("amountsIncludeTax")}
      />
    </section>
    <DocumentFormFooter onCancel={() => router.push(cancelHref)}>{status === "active" ? <Button type="button" disabled={isSubmitting} onClick={handleSubmit((values) => save(values, "issue"))}>{isSubmitting && <LoaderCircle className="size-4 animate-spin" />} Update Issued Order</Button> : <div className="flex gap-2"><Button type="button" variant="secondary" disabled={isSubmitting} onClick={handleSubmit((values) => save(values, "draft"))}>Save Draft</Button><Button type="button" disabled={isSubmitting} onClick={handleSubmit((values) => save(values, "issue"))}>{isSubmitting && <LoaderCircle className="size-4 animate-spin" />} Issue Order</Button></div>}</DocumentFormFooter>
    </form>;
}
