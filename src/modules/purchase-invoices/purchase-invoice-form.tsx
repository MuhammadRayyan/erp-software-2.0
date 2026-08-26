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
import {
  minorToCurrencyInput,
  parseCurrencyAmountToMinor,
} from "@/modules/currency/conversion";
import {
  calculateTax,
  multiplyMoneyByQuantity,
  parseQuantityToMicros,
  splitTaxInclusive,
  calculateDiscount,
} from "@/modules/accounting/calculations/money";
import { savePurchaseInvoiceAction } from "./actions";
import {
  purchaseInvoiceInputSchema,
  type PurchaseInvoiceInput,
} from "./purchase-invoice-input";
import type { PurchaseInvoiceStatus } from "./purchase-invoice-service";
import {
  DocumentCurrencyFields,
  type DocumentCurrencyOption,
  type DocumentRateOption,
} from "@/modules/currency/document-currency-fields";
import { DocumentFormFooter } from "@/components/document-form-footer";
import { SelectNative } from "@/components/ui/select-native";

type AccountOption = { id: string; code: string; name: string };
type TaxOption = {
  id: string;
  rateBasisPoints: number;
  name: string;
  vatCategory: string;
};
type Option = { id: string; name: string; defaultCurrencyCode?: string | null };
type OrderOption = { id: string; orderNumber: string; supplierId: string };
type ProjectOption = { id: string; code: string; name: string };
type ItemOption = {
  id: string;
  sku: string | null;
  name: string;
  purchasePriceMinor: number | null;
  inventoryAssetAccountId: string;
};

function previewLine(
  line: PurchaseInvoiceInput["lines"][number] | undefined,
  taxCodes: TaxOption[],
  minorUnit: number,
  amountsIncludeTax: boolean,
) {
  try {
    if (!line) return { netMinor: 0, taxMinor: 0, grossMinor: 0 };
    const unitPriceMinor = parseCurrencyAmountToMinor(
      String(line.unitPrice || "0"),
      minorUnit,
      "Unit price",
    );
    const quantityMicros = parseQuantityToMicros(String(line.quantity || "0"));
    const lineTotalMinor = multiplyMoneyByQuantity(
      unitPriceMinor,
      quantityMicros,
    );
    const discountMinor = calculateDiscount(
      lineTotalMinor,
      line.discountType || "none",
      String(line.discountValue || "0"),
      minorUnit,
    );
    const discountedTotalMinor = lineTotalMinor - discountMinor;
    const code = taxCodes.find((tax) => tax.id === line.taxCodeId);
    const rate = code?.rateBasisPoints ?? 0;

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
    grossMinor = code?.vatCategory === "reverse_charge" ? netMinor : grossMinor;
    return { netMinor, taxMinor, grossMinor };
  } catch {
    return { netMinor: 0, taxMinor: 0, grossMinor: 0 };
  }
}

export function PurchaseInvoiceForm({
  businessId,
  invoiceId,
  documentStatus = "draft",
  suppliers,
  expenseAccounts,
  taxCodes,
  orders,
  projects,
  items,
  currency,
  currencies,
  rates,
  initial,
}: {
  businessId: string;
  invoiceId?: string;
  documentStatus?: PurchaseInvoiceStatus;
  suppliers: Option[];
  expenseAccounts: AccountOption[];
  taxCodes: TaxOption[];
  orders: OrderOption[];
  projects: ProjectOption[];
  items: ItemOption[];
  currency: string;
  currencies: DocumentCurrencyOption[];
  rates: DocumentRateOption[];
  initial: PurchaseInvoiceInput;
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState("");
  const [showLineProjects, setShowLineProjects] = useState(() =>
    initial.lines.some((line) => Boolean(line.projectId))
  );
  const [showDiscounts, setShowDiscounts] = useState(() =>
    initial.lines.some((line) => line.discountType !== "none")
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
  const form = useForm<PurchaseInvoiceInput>({
    resolver: zodResolver(purchaseInvoiceInputSchema),
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
  const lines = useWatch({ control, name: "lines" }) ?? [];
  const supplierId = useWatch({ control, name: "supplierId" });
  const currencyCode = useWatch({ control, name: "currencyCode" }) || currency;
  const exchangeRateToBase =
    useWatch({ control, name: "exchangeRateToBase" }) || "";
  const exchangeRateDate =
    useWatch({ control, name: "exchangeRateDate" }) || "";
  const exchangeRateSource =
    useWatch({ control, name: "exchangeRateSource" }) || "";
  const invoiceDate = useWatch({ control, name: "invoiceDate" }) || "";
  const taxDate = useWatch({ control, name: "taxDate" }) || invoiceDate;
  const minorUnit =
    currencies.find((entry) => entry.code === currencyCode)?.minorUnit ?? 2;
  const amountsIncludeTax =
    useWatch({ control, name: "amountsIncludeTax" }) ?? false;
  const previews = lines.map((line) =>
    previewLine(line, taxCodes, minorUnit, amountsIncludeTax)
  );
  const subtotalMinor = previews.reduce((sum, row) => sum + row.netMinor, 0);
  const taxMinor = previews.reduce((sum, row) => sum + row.taxMinor, 0);
  const totalMinor = previews.reduce((sum, row) => sum + row.grossMinor, 0);
  const defaultTax =
    taxCodes.find((item) => item.rateBasisPoints === 500)?.id ??
    taxCodes[0]?.id ??
    "";
  
  function updateGlobalTax(newTaxId: string) {
    setGlobalTaxCodeId(newTaxId);
    lines.forEach((_, i) => form.setValue(`lines.${i}.taxCodeId`, newTaxId));
  }

  const defaultExpense = expenseAccounts[0]?.id ?? "";
  function selectItem(index: number, itemId: string) {
    const item = items.find((entry) => entry.id === itemId);
    if (!item) {
      form.setValue(`lines.${index}.expenseAccountId`, defaultExpense);
      return;
    }
    form.setValue(`lines.${index}.description`, item.name);
    form.setValue(
      `lines.${index}.unitPrice`,
      minorToCurrencyInput(item.purchasePriceMinor ?? 0, minorUnit)
    );
    form.setValue(
      `lines.${index}.expenseAccountId`,
      item.inventoryAssetAccountId
    );
  }
  async function save(values: PurchaseInvoiceInput, intent: "draft" | "post") {
    setServerError("");
    const result = await savePurchaseInvoiceAction(
      businessId,
      invoiceId ?? null,
      values,
      intent,
    );
    if (result.fieldErrors)
      for (const [field, messages] of Object.entries(result.fieldErrors))
        setError(field as keyof PurchaseInvoiceInput, { message: messages[0] });
    if (result.error) setServerError(result.error);
  }
  const cancelHref = invoiceId
    ? `/b/${businessId}/purchases/invoices/${invoiceId}`
    : `/b/${businessId}/purchases/invoices`;
  return (
    <form className="space-y-7 max-w-none" noValidate>
      {serverError && <FormError message={serverError} />}
      <section className="border-b border-border pb-7">
        <h2 className="text-base font-semibold">Bill details</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Posting creates the Accounts Payable, expense, and Input VAT journal
          atomically.
        </p>
        <div className="mt-5 grid gap-5 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="supplierId">Supplier</Label>
            <SelectNative
              id="supplierId"
              {...register("supplierId", {
                onChange: (event) => {
                  setValue("purchaseOrderId", "");
                  if (documentStatus === "draft") {
                    const code =
                      suppliers.find(
                        (supplier) => supplier.id === event.target.value,
                      )?.defaultCurrencyCode ?? currency;
                    setValue("currencyCode", code);
                    setValue(
                      "exchangeRateToBase",
                      code === currency ? "1" : "",
                    );
                    setValue(
                      "exchangeRateDate",
                      code === currency ? taxDate || invoiceDate : "",
                    );
                    setValue(
                      "exchangeRateSource",
                      code === currency ? "Base" : "",
                    );
                  }
                },
              })}
              aria-invalid={!!errors.supplierId}
            >
              <option value="">Choose a supplier…</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </SelectNative>
            {errors.supplierId && (
              <p className="field-error">{errors.supplierId.message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="supplierInvoiceNumber">Supplier invoice #</Label>
            <Input
              id="supplierInvoiceNumber"
              {...register("supplierInvoiceNumber")}
              aria-invalid={!!errors.supplierInvoiceNumber}
            />
            {errors.supplierInvoiceNumber && (
              <p className="field-error">
                {errors.supplierInvoiceNumber.message}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="purchaseOrderId">
              Purchase order{" "}
              <span className="font-normal text-muted-foreground">
                (optional)
              </span>
            </Label>
            <SelectNative id="purchaseOrderId" {...register("purchaseOrderId")}>
              <option value="">No linked order</option>
              {orders
                .filter((order) => order.supplierId === supplierId)
                .map((order) => (
                  <option key={order.id} value={order.id}>
                    {order.orderNumber}
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
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.code} — {project.name}
                </option>
              ))}
            </SelectNative>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="invoiceDate">Invoice date</Label>
            <Input
              id="invoiceDate"
              type="date"
              {...register("invoiceDate")}
              aria-invalid={!!errors.invoiceDate}
            />
            {errors.invoiceDate && (
              <p className="field-error">{errors.invoiceDate.message}</p>
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
            <Label htmlFor="dueDate">Due date</Label>
            <Input
              id="dueDate"
              type="date"
              {...register("dueDate")}
              aria-invalid={!!errors.dueDate}
            />
            {errors.dueDate && (
              <p className="field-error">{errors.dueDate.message}</p>
            )}
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="reference">
              Reference{" "}
              <span className="font-normal text-muted-foreground">
                (optional)
              </span>
            </Label>
            <Input id="reference" {...register("reference")} />
          </div>
        </div>
      </section>
      <section className="border-b border-border pb-7">
        <h2 className="mb-4 text-base font-semibold">Document currency</h2>
        <DocumentCurrencyFields
          baseCurrencyCode={currency}
          currencies={currencies}
          rates={rates}
          currencyCode={currencyCode}
          exchangeRateToBase={exchangeRateToBase}
          exchangeRateDate={exchangeRateDate}
          exchangeRateSource={exchangeRateSource}
          relevantDate={taxDate || invoiceDate}
          disabled={documentStatus === "posted"}
          onChange={(field, value) => setValue(field, value)}
        />
        {currencyCode !== currency && (
          <p className="mt-3 text-xs text-muted-foreground">
            Posting converts expenses, inventory, Input VAT, and Accounts
            Payable to {currency} using this exact rate snapshot.
          </p>
        )}
      </section>
      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Line items</h2>
            <p className="mt-1 text-sm text-muted-foreground">Select an item for inventory sales, or leave it blank for a service line.</p>
          </div>
          <div className="flex gap-4 items-center">
            <div className="flex items-center gap-2">
              <label htmlFor="globalTax" className="text-sm font-medium">Default Tax:</label>
              <select id="globalTax" className="w-40 flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50" value={globalTaxCodeId} onChange={(e) => updateGlobalTax(e.target.value)}>
                {taxCodes.map((taxCode) => <option key={taxCode.id} value={taxCode.id}>{taxCode.name}</option>)}
              </select>
            </div>
            <Button type="button" variant="secondary" size="sm" onClick={() => append({ itemId: "", description: "", quantity: "1", unitPrice: "0.00", discountType: "none", discountValue: "0", expenseAccountId: defaultExpense, taxCodeId: globalTaxCodeId, projectId: "" })}>
              <Plus className="size-4" /> Add line
            </Button>
          </div>
        </div>
        {typeof errors.lines?.message === "string" && <p className="field-error mb-2">{errors.lines.message}</p>}
        <div className="rounded-lg border border-border bg-surface-raised w-full overflow-x-auto">
          <table className="data-table w-full whitespace-nowrap min-w-max">
            <thead>
              <tr>
                {showLineNumber && <th className="w-12 min-w-[48px] text-center">#</th>}
                <th className="w-56 min-w-[220px]">Item <span className="font-normal text-muted-foreground">(optional)</span></th>
                {showDescription && <th className="w-64 min-w-[250px]">Description</th>}
                <th className="w-28 min-w-[100px] text-right!">Qty</th>
                <th className="w-36 min-w-[130px] text-right!">Rate</th>
                {showDiscounts && <th className="w-48 min-w-[170px] text-right!">Discount</th>}
                <th className="w-48 min-w-[180px]">Account</th>
                {showLineProjects && <th className="w-56 min-w-[200px]">Project</th>}
                {!amountsIncludeTax && <th className="w-32 min-w-[110px] text-right!">Amount</th>}
                {!amountsIncludeTax && <th className="w-32 min-w-[110px] text-right!">Tax</th>}
                <th className="w-36 min-w-[130px] text-right!">Total</th>
                <th className="w-12 min-w-[48px]"><span className="sr-only">Remove</span></th>
              </tr>
            </thead>
            <tbody>
              {fields.map((field, index) => (
                <tr key={field.id} className="hover:bg-transparent!">
                  {showLineNumber && <td className="py-2 text-center text-muted-foreground">{index + 1}</td>}
                  <td>
                    <select aria-label={`Line ${index + 1} inventory item`} className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50" {...register(`lines.${index}.itemId`, { onChange: (event) => selectItem(index, event.target.value) })}>
                      <option value="">Service / free text</option>
                      {items.map((item) => <option key={item.id} value={item.id}>{item.sku ? `${item.sku} � ` : ""}{item.name}</option>)}
                    </select>
                  </td>
                  {showDescription && (
                    <td className="py-2">
                      <Input aria-label={`Line ${index + 1} description`} {...register(`lines.${index}.description`)} />
                      {errors.lines?.[index]?.description && <p className="field-error">{errors.lines[index]?.description?.message}</p>}
                    </td>
                  )}
                  <td className="py-2">
                    <Input className="money text-right" type="number" step="0.0001" min="0.0001" aria-label={`Line ${index + 1} quantity`} {...register(`lines.${index}.quantity`)} />
                  </td>
                  <td className="py-2">
                    <Input className="money text-right" type="number" step="0.000001" min="0" aria-label={`Line ${index + 1} rate`} {...register(`lines.${index}.unitPrice`)} />
                  </td>
                  {showDiscounts && (
                    <td className="py-2">
                      <div className="flex gap-1 justify-end">
                        <select aria-label={`Line ${index + 1} discount type`} className="w-[70px] px-2 py-1 h-9 flex items-center justify-between rounded-md border border-input bg-transparent text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50" {...register(`lines.${index}.discountType`)}>
                          <option value="none">None</option>
                          <option value="percentage">%</option>
                          <option value="fixed">Fixed</option>
                        </select>
                        {lines[index]?.discountType !== "none" && (
                          <Input aria-label={`Line ${index + 1} discount value`} className="money w-20 text-right px-2 py-1 h-9" type="number" step="any" min="0" {...register(`lines.${index}.discountValue`)} />
                        )}
                      </div>
                    </td>
                  )}
                  <td className="py-2">
                    {lines[index]?.itemId ? (
                      <><input type="hidden" {...register(`lines.${index}.expenseAccountId`)} /><span className="text-sm text-muted-foreground">From item</span></>
                    ) : (
                      <select aria-label={`Line ${index + 1} expense account`} className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50" {...register(`lines.${index}.expenseAccountId`)}>
                        {expenseAccounts.map((account) => <option key={account.id} value={account.id}>{account.code} {account.name}</option>)}
                      </select>
                    )}
                    <input type="hidden" {...register(`lines.${index}.taxCodeId`)} />
                  </td>
                  {showLineProjects && (
                    <td className="py-2">
                      <select aria-label={`Line ${index + 1} project`} className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50" {...register(`lines.${index}.projectId`)}>
                        <option value="">Use document Project</option>
                        {projects.map((project) => <option key={project.id} value={project.id}>{project.code} � {project.name}</option>)}
                      </select>
                    </td>
                  )}
                  
                  {!amountsIncludeTax && <td className="money text-right">{formatMoney(previews[index]?.netMinor ?? 0, currencyCode, minorUnit)}</td>}
                  {!amountsIncludeTax && <td className="money text-right">{formatMoney(previews[index]?.taxMinor ?? 0, currencyCode, minorUnit)}</td>}
                  
                  <td className="money text-right font-medium">{formatMoney(previews[index]?.grossMinor ?? 0, currencyCode, minorUnit)}</td>
                  <td>
                    <Button type="button" variant="ghost" size="icon" aria-label={`Remove line ${index + 1}`} disabled={fields.length === 1} onClick={() => remove(index)}>
                      <Trash2 className="size-4 text-muted-foreground" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-5 flex flex-col md:flex-row items-start justify-between gap-6">
          <div className="flex flex-col gap-3 pt-2">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" className="size-4 rounded-[4px] border-border-strong accent-primary" checked={showLineNumber} onChange={(e) => setShowLineNumber(e.target.checked)} />
              Column � Line number
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" className="size-4 rounded-[4px] border-border-strong accent-primary" checked={showDescription} onChange={(e) => setShowDescription(e.target.checked)} />
              Column � Description
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" className="size-4 rounded-[4px] border-border-strong accent-primary" checked={showDiscounts} onChange={(e) => setShowDiscounts(e.target.checked)} />
              Column � Discount
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" className="size-4 rounded-[4px] border-border-strong accent-primary" checked={showLineProjects} onChange={(e) => setShowLineProjects(e.target.checked)} />
              Column � Project
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer mt-2 border-t pt-2 border-border">
              <input type="checkbox" className="size-4 rounded-[4px] border-border-strong accent-primary" {...register("amountsIncludeTax")} />
              Amounts are tax inclusive
            </label>
          </div>

          <dl className="w-full max-w-xs space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="money">{formatMoney(subtotalMinor, currencyCode, minorUnit)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">VAT</dt>
              <dd className="money">{formatMoney(taxMinor, currencyCode, minorUnit)}</dd>
            </div>
            <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
              <dt>Total</dt>
              <dd className="money">{formatMoney(subtotalMinor + taxMinor, currencyCode, minorUnit)}</dd>
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
            Update Posted Invoice
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
              Post Invoice
            </Button>
          </div>
        )}
      </DocumentFormFooter>
    </form>
  );
}
