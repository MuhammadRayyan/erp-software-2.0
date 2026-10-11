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
  const totals = useDocumentTotals<PurchaseInvoiceInput>({
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
          <div className="space-y-1.5">
            <Label htmlFor="reference">
              Reference{" "}
              <span className="font-normal text-muted-foreground">
                (optional)
              </span>
            </Label>
            <Input id="reference" {...register("reference")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">
              Notes <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input id="notes" placeholder="Notes..." {...register("notes")} />
          </div>
          <div className="space-y-1.5 md:col-span-3">
            <Label htmlFor="terms">
              Terms & conditions <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input id="terms" placeholder="Payment terms, delivery instructions..." {...register("terms")} />
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
