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
import { minorToCurrencyInput } from "@/modules/currency/conversion";
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
import { DocumentLineTable, useDocumentTotals } from "@/components/documents";

type AccountOption = { id: string; name: string };
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
export type SupplierPrepaymentOption = {
  paymentId: string;
  paymentNumber: string;
  date: string;
  currencyCode: string;
  unallocatedAmountMinor: number;
};

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
  availableSupplierPrepayments,
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
  availableSupplierPrepayments?: Record<string, SupplierPrepaymentOption[]>;
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState("");
  const [globalTaxCodeId, setGlobalTaxCodeId] = useState(
    () =>
      initial.lines[0]?.taxCodeId ||
      taxCodes.find((taxCode) => taxCode.rateBasisPoints === 500)?.id ||
      taxCodes[0]?.id ||
      ""
  );
  const form = useForm<PurchaseInvoiceInput>({
    resolver: zodResolver(purchaseInvoiceInputSchema),
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
  const totals = useDocumentTotals<PurchaseInvoiceInput>({
    control,
    taxCodes,
    minorUnit,
  });
  const billTotalMinor = totals.subtotalMinor + totals.taxMinor;
  const applyAvailablePrepayment = useWatch({ control, name: "applyAvailablePrepayment" });
  const currentPrepayments: SupplierPrepaymentOption[] = (availableSupplierPrepayments?.[supplierId] || []).filter(
    (p: SupplierPrepaymentOption) => p.currencyCode === currencyCode
  );
  const totalAvailablePrepaymentMinor = currentPrepayments.reduce(
    (s: number, p: SupplierPrepaymentOption) => s + p.unallocatedAmountMinor,
    0
  );
  const prepaymentAppliedMinor =
    !invoiceId && applyAvailablePrepayment && totalAvailablePrepaymentMinor > 0
      ? Math.min(billTotalMinor, totalAvailablePrepaymentMinor)
      : 0;
      
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
    <form className="space-y-5 max-w-none" noValidate>
      {serverError && <FormError message={serverError} />}
      <section className="form-section">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Bill details</h2>
          <span className="text-xs text-muted-foreground font-medium bg-muted/60 px-2 py-0.5 rounded border border-border/50">
            Internal Bill # Auto-allocated on save
          </span>
        </div>
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

          {!invoiceId && totalAvailablePrepaymentMinor > 0 && (
            <div className="md:col-span-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-sm dark:bg-emerald-950/25">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <Coins className="size-5 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
                  <div>
                    <p className="font-semibold text-emerald-900 dark:text-emerald-200">
                      Supplier Prepayment Balance Available: {formatMoney(totalAvailablePrepaymentMinor, currencyCode, minorUnit)}
                    </p>
                    <p className="mt-0.5 text-xs text-emerald-700 dark:text-emerald-300">
                      {currentPrepayments.length === 1
                        ? `Payment ${currentPrepayments[0].paymentNumber} (${formatDate(currentPrepayments[0].date)}) has unallocated advance funds.`
                        : `${currentPrepayments.length} payments have unallocated advance funds. Prepayment will be applied automatically upon posting.`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 cursor-pointer select-none font-medium text-emerald-900 dark:text-emerald-200">
                    <input
                      type="checkbox"
                      className="size-4 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500"
                      {...register("applyAvailablePrepayment")}
                    />
                    <span className="text-xs sm:text-sm">Apply prepayment upon posting</span>
                  </label>
                </div>
              </div>
            </div>
          )}
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
            <SelectNative
              id="purchaseOrderId"
              {...register("purchaseOrderId", {
                onChange: (e) => {
                  const ord = orders.find((o) => o.id === e.target.value);
                  if (ord) {
                    if (!form.getValues("supplierId")) {
                      form.setValue("supplierId", ord.supplierId);
                    }
                    if (!form.getValues("reference")) {
                      form.setValue("reference", `PO ${ord.orderNumber}`);
                    }
                  }
                }
              })}
            >
              <option value="">No linked order</option>
              {orders
                .filter((order) => !supplierId || order.supplierId === supplierId)
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
          <div className="space-y-1.5">
            <Label htmlFor="reference">
              Reference{" "}
              <span className="font-normal text-muted-foreground">
                (optional)
              </span>
            </Label>
            <Input id="reference" {...register("reference")} />
          </div>
          <div className="space-y-1.5 md:col-span-3 grid md:grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <Label htmlFor="notes">
                Notes <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Textarea id="notes" rows={2} placeholder="Notes..." {...register("notes")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="terms">
                Terms & conditions <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Textarea id="terms" rows={2} placeholder="Payment terms, delivery instructions..." {...register("terms")} />
            </div>
          </div>
        </div>
      </section>
      <section className="form-section">
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
          onDuplicate={duplicateLine}
          onMoveUp={moveLineUp}
          onMoveDown={moveLineDown}
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
      <DocumentFormFooter
        onCancel={() => router.push(cancelHref)}
        status={documentStatus}
        totals={{
          subtotalMinor: totals.subtotalMinor,
          taxMinor: totals.taxMinor,
          creditAppliedMinor: prepaymentAppliedMinor,
          totalMinor: totals.subtotalMinor + totals.taxMinor,
          currencyCode,
          minorUnit,
        }}
      >
        {documentStatus === "posted" ? (
          <Button
            type="button"
            disabled={isSubmitting}
            onClick={handleSubmit((values) => save(values, "post"))}
          >
            {isSubmitting && <LoaderCircle className="size-4 animate-spin" />}{" "}
            Save Changes
          </Button>
        ) : (
          <Button
            type="button"
            disabled={isSubmitting}
            onClick={handleSubmit((values) => save(values, "draft"))}
          >
            {isSubmitting && <LoaderCircle className="size-4 animate-spin" />}{" "}
            {invoiceId ? "Save Draft" : "Save Draft Bill"}
          </Button>
        )}
      </DocumentFormFooter>
    </form>
  );
}
