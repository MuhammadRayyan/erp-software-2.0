"use client";
import { useRouter } from "next/navigation";
import { FormError } from "@/components/form-error";
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney } from "@/core/format";
import { savePurchaseOrderAction } from "./actions";
import { purchaseOrderInputSchema, type PurchaseOrderInput } from "./purchase-order-input";
import type { PurchaseOrderStatus } from "./purchase-order-service";
import { DocumentCurrencyFields, type DocumentCurrencyOption, type DocumentRateOption } from "@/modules/currency/document-currency-fields";
import { DocumentFormFooter } from "@/components/document-form-footer";
import { SelectNative } from "@/components/ui/select-native";
import { DocumentLineTable, useDocumentTotals } from "@/components/documents";

type Option = { id: string; name: string; defaultCurrencyCode: string | null };
type AccountOption = { id: string; name: string };
type TaxOption = { id: string; name: string; rateBasisPoints: number };
type ProjectOption = { id: string; code: string; name: string };
type ItemOption = { id: string; sku: string | null; name: string; purchasePriceMinor: number | null; inventoryAssetAccountId: string };

export function PurchaseOrderForm({ businessId, orderId, status = "draft", suppliers, expenseAccounts, taxCodes, projects, items, currency, currencies, rates, initial }: { businessId: string; orderId?: string; status?: PurchaseOrderStatus; suppliers: Option[]; expenseAccounts: AccountOption[]; taxCodes: TaxOption[]; projects: ProjectOption[]; items: ItemOption[]; currency: string; currencies: DocumentCurrencyOption[]; rates: DocumentRateOption[]; initial: PurchaseOrderInput }) {
  const router = useRouter();
  const [serverError, setServerError] = useState("");
  const [globalTaxCodeId, setGlobalTaxCodeId] = useState(() => initial.lines[0]?.taxCodeId || taxCodes.find((taxCode) => taxCode.rateBasisPoints === 500)?.id || taxCodes[0]?.id || "");
  const form = useForm<PurchaseOrderInput>({ resolver: zodResolver(purchaseOrderInputSchema), defaultValues: initial });
  const { register, control, handleSubmit, setError, setValue, formState: { errors, isSubmitting } } = form;
  const { fields, append, remove } = useFieldArray({ control, name: "lines" });
  const lines = useWatch({ control, name: "lines" }) ?? [];
  const currencyCode = useWatch({ control, name: "currencyCode" }) || currency; const exchangeRateToBase = useWatch({ control, name: "exchangeRateToBase" }) || ""; const exchangeRateDate = useWatch({ control, name: "exchangeRateDate" }) || ""; const exchangeRateSource = useWatch({ control, name: "exchangeRateSource" }) || ""; const orderDate = useWatch({ control, name: "date" }) || "";
  const minorUnit = currencies.find((entry) => entry.code === currencyCode)?.minorUnit ?? 2;
  const totals = useDocumentTotals<PurchaseOrderInput>({
    control,
    taxCodes,
    minorUnit,
  });
    function updateGlobalTax(newTaxId: string) {
    setGlobalTaxCodeId(newTaxId);
    lines.forEach((_, i) => form.setValue(`lines.${i}.taxCodeId`, newTaxId));
  }

  const defaultExpense = expenseAccounts[0]?.id ?? "";
  function selectItem(index: number, itemId: string) {
    const item = items.find((i) => i.id === itemId);
    if (!item) {
      form.setValue(`lines.${index}.expenseAccountId`, defaultExpense);
      return;
    }
    form.setValue(`lines.${index}.description`, item.name);
    if (item.purchasePriceMinor != null) {
      form.setValue(`lines.${index}.unitPrice`, formatMoney(item.purchasePriceMinor, currency, minorUnit).replace(/[^0-9.]/g, ""));
    }
    if (item.inventoryAssetAccountId) {
      form.setValue(`lines.${index}.expenseAccountId`, item.inventoryAssetAccountId);
    }
  }
  async function save(values: PurchaseOrderInput, intent: "draft" | "issue") {
    setServerError("");
    const result = await savePurchaseOrderAction(businessId, orderId ?? null, values, intent);
    if (result.fieldErrors) for (const [field, messages] of Object.entries(result.fieldErrors)) setError(field as keyof PurchaseOrderInput, { message: messages[0] });
    if (result.error) setServerError(result.error);
  }
  const cancelHref = orderId ? `/b/${businessId}/purchases/orders/${orderId}` : `/b/${businessId}/purchases/orders`;
  return <form className="space-y-5 max-w-none" noValidate>
    {serverError && <FormError message={serverError} />}
    <section className="form-section"><h2 className="text-base font-semibold">Order details</h2><p className="mt-1 text-sm text-muted-foreground">Purchase orders are operational documents and never post to the ledger.</p><div className="mt-5 grid gap-5 md:grid-cols-3">
      <div className="space-y-1.5"><Label htmlFor="supplierId">Supplier</Label><SelectNative id="supplierId"  {...register("supplierId", { onChange: (event) => { if (status === "draft") { const code = suppliers.find((supplier) => supplier.id === event.target.value)?.defaultCurrencyCode ?? currency; setValue("currencyCode", code); setValue("exchangeRateToBase", code === currency ? "1" : ""); setValue("exchangeRateDate", code === currency ? orderDate : ""); setValue("exchangeRateSource", code === currency ? "Base" : ""); } } })} aria-invalid={!!errors.supplierId}><option value="">Choose a supplier…</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</SelectNative>{errors.supplierId && <p className="field-error">{errors.supplierId.message}</p>}</div>
      <div className="space-y-1.5"><Label htmlFor="date">Order date</Label><Input id="date" type="date" {...register("date")} aria-invalid={!!errors.date} />{errors.date && <p className="field-error">{errors.date.message}</p>}</div>
      <div className="space-y-1.5"><Label htmlFor="expectedDate">Expected date <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="expectedDate" type="date" {...register("expectedDate")} /></div>
      <div className="space-y-1.5"><Label htmlFor="projectId">Project <span className="font-normal text-muted-foreground">(optional)</span></Label><SelectNative id="projectId"  {...register("projectId")}><option value="">No project</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.code} — {project.name}</option>)}</SelectNative></div>
      <div className="space-y-1.5"><Label htmlFor="reference">Reference <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="reference" {...register("reference")} /></div>
      <div className="space-y-1.5"><Label htmlFor="notes">Notes <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="notes" placeholder="Notes..." {...register("notes")} /></div>
      <div className="space-y-1.5 md:col-span-3"><Label htmlFor="terms">Terms & conditions <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="terms" placeholder="Purchase order delivery and payment terms..." {...register("terms")} /></div>
    </div></section>
    <section className="form-section"><h2 className="mb-4 text-base font-semibold">Commitment currency</h2><DocumentCurrencyFields baseCurrencyCode={currency} currencies={currencies} rates={rates} currencyCode={currencyCode} exchangeRateToBase={exchangeRateToBase} exchangeRateDate={exchangeRateDate} exchangeRateSource={exchangeRateSource} relevantDate={orderDate} disabled={status === "issued"} onChange={(field, value) => setValue(field, value)} /><p className="mt-3 text-xs text-muted-foreground">This is an operational commitment snapshot only. A later Purchase Invoice uses its own posting and VAT rate.</p></section>
    <section className="form-section">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Line items</h2>
          <p className="mt-1 text-sm text-muted-foreground">Select an item for inventory sales, or leave it blank for a service line.</p>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="globalTax" className="text-sm font-medium">Default Tax:</Label>
          <SelectNative
            id="globalTax"
            className="w-40"
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
            expenseAccountId: defaultExpense,
            taxCodeId: globalTaxCodeId,
            projectId: "",
          })
        }
        onRemove={remove}
        items={items}
        onItemSelect={selectItem}
        accounts={expenseAccounts}
        accountFieldName="expenseAccountId"
        accountAriaLabel="expense account"
        initialShowLineTaxCodes={false}
        taxCodes={taxCodes}
        projects={projects}
        currencyCode={currencyCode}
        minorUnit={minorUnit}
        previews={totals.previews}
        amountsIncludeTax={totals.amountsIncludeTax}
        registerAmountsIncludeTax={register("amountsIncludeTax")}
        subtotalMinor={totals.subtotalMinor}
        taxMinor={totals.taxMinor}
      />
    </section>
    <DocumentFormFooter onCancel={() => router.push(cancelHref)}>{status === "issued" ? <Button type="button" disabled={isSubmitting} onClick={handleSubmit((values) => save(values, "issue"))}>{isSubmitting && <LoaderCircle className="size-4 animate-spin" />} Update Issued Order</Button> : <div className="flex gap-2"><Button type="button" variant="secondary" disabled={isSubmitting} onClick={handleSubmit((values) => save(values, "draft"))}>Save Draft</Button><Button type="button" disabled={isSubmitting} onClick={handleSubmit((values) => save(values, "issue"))}>{isSubmitting && <LoaderCircle className="size-4 animate-spin" />} Issue Order</Button></div>}</DocumentFormFooter>
    </form>;
}
