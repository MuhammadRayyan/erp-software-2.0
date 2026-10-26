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
import { savePurchaseQuoteAction } from "./actions";
import { purchaseQuoteInputSchema, type PurchaseQuoteInput } from "./purchase-quote-input";
import type { PurchaseQuoteStatus } from "./purchase-quote-service";
import { DocumentCurrencyFields, type DocumentCurrencyOption, type DocumentRateOption } from "@/modules/currency/document-currency-fields";
import { DocumentFormFooter } from "@/components/document-form-footer";
import { SelectNative } from "@/components/ui/select-native";
import { DocumentLineTable, useDocumentTotals } from "@/components/documents";
import { broadcastLiveRefresh } from "@/components/use-live-refresh";

type Option = { id: string; name: string; defaultCurrencyCode: string | null };
type AccountOption = { id: string; name: string };
type TaxOption = { id: string; name: string; rateBasisPoints: number };
type ProjectOption = { id: string; code: string; name: string };
type ItemOption = { id: string; sku: string | null; name: string; purchasePriceMinor: number | null; inventoryAssetAccountId: string };

export function PurchaseQuoteForm({
  businessId,
  quoteId,
  status = "draft",
  suppliers,
  expenseAccounts,
  taxCodes,
  projects,
  items,
  currency,
  currencies,
  rates,
  initial,
}: {
  businessId: string;
  quoteId?: string;
  status?: PurchaseQuoteStatus;
  suppliers: Option[];
  expenseAccounts: AccountOption[];
  taxCodes: TaxOption[];
  projects: ProjectOption[];
  items: ItemOption[];
  currency: string;
  currencies: DocumentCurrencyOption[];
  rates: DocumentRateOption[];
  initial: PurchaseQuoteInput;
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState("");
  const [globalTaxCodeId, setGlobalTaxCodeId] = useState(
    () => initial.lines[0]?.taxCodeId || taxCodes.find((taxCode) => taxCode.rateBasisPoints === 500)?.id || taxCodes[0]?.id || "",
  );

  const form = useForm<PurchaseQuoteInput>({
    resolver: zodResolver(purchaseQuoteInputSchema),
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
  const currencyCode = useWatch({ control, name: "currencyCode" }) || currency;
  const exchangeRateToBase = useWatch({ control, name: "exchangeRateToBase" }) || "";
  const exchangeRateDate = useWatch({ control, name: "exchangeRateDate" }) || "";
  const exchangeRateSource = useWatch({ control, name: "exchangeRateSource" }) || "";
  const quoteDate = useWatch({ control, name: "date" }) || "";
  const minorUnit = currencies.find((entry) => entry.code === currencyCode)?.minorUnit ?? 2;
  const totals = useDocumentTotals<PurchaseQuoteInput>({
    control,
    taxCodes,
    minorUnit,
  });
  const defaultExpense = expenseAccounts[0]?.id ?? "";

  function updateGlobalTax(newTaxId: string) {
    setGlobalTaxCodeId(newTaxId);
    lines.forEach((_, i) => form.setValue(`lines.${i}.taxCodeId`, newTaxId));
  }

  function selectItem(index: number, itemId: string) {
    const item = items.find((i) => i.id === itemId);
    if (!item) {
      form.setValue(`lines.${index}.expenseAccountId`, defaultExpense);
      return;
    }
    form.setValue(`lines.${index}.description`, item.name);
    if (item.purchasePriceMinor != null) {
      form.setValue(
        `lines.${index}.unitPrice`,
        formatMoney(item.purchasePriceMinor, currency, minorUnit).replace(/[^0-9.]/g, ""),
      );
    }
    if (item.inventoryAssetAccountId) {
      form.setValue(`lines.${index}.expenseAccountId`, item.inventoryAssetAccountId);
    }
  }

  async function save(values: PurchaseQuoteInput, intent: "draft" | "issue") {
    setServerError("");
    const result = await savePurchaseQuoteAction(businessId, quoteId ?? null, values, intent);
    if (result.fieldErrors) {
      for (const [field, messages] of Object.entries(result.fieldErrors)) {
        setError(field as keyof PurchaseQuoteInput, { message: messages[0] });
      }
    }
    if (result.error) setServerError(result.error);
    if (!result.error && !result.fieldErrors) broadcastLiveRefresh();
  }

  const cancelHref = quoteId ? `/b/${businessId}/purchases/quotes/${quoteId}` : `/b/${businessId}/purchases/quotes`;

  return (
    <form className="space-y-5 max-w-none" noValidate>
      {serverError && <FormError message={serverError} />}
      <section className="form-section">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Quote details</h2>
          <span className="text-xs text-muted-foreground font-medium bg-muted/60 px-2 py-0.5 rounded border border-border/50">
            Quote # Auto-allocated on save
          </span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Purchase quotes (RFQs) are operational supplier documents and never affect the ledger.
        </p>
        <div className="mt-5 grid gap-5 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="supplierId">Supplier</Label>
            <SelectNative
              id="supplierId"
              {...register("supplierId", {
                onChange: (event) => {
                  if (status === "draft") {
                    const code = suppliers.find((s) => s.id === event.target.value)?.defaultCurrencyCode ?? currency;
                    setValue("currencyCode", code);
                    setValue("exchangeRateToBase", code === currency ? "1" : "");
                    setValue("exchangeRateDate", code === currency ? quoteDate : "");
                    setValue("exchangeRateSource", code === currency ? "Base" : "");
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
            {errors.supplierId && <p className="field-error">{errors.supplierId.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="date">Quote date</Label>
            <Input id="date" type="date" {...register("date")} aria-invalid={!!errors.date} />
            {errors.date && <p className="field-error">{errors.date.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="expiryDate">
              Expiry date <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input id="expiryDate" type="date" {...register("expiryDate")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="projectId">
              Project <span className="font-normal text-muted-foreground">(optional)</span>
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
            <Label htmlFor="reference">
              Supplier RFQ / Reference <span className="font-normal text-muted-foreground">(optional)</span>
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
              <Textarea id="terms" rows={2} placeholder="Supplier terms and delivery conditions..." {...register("terms")} />
            </div>
          </div>
        </div>
      </section>

      <section className="form-section">
        <h2 className="mb-4 text-base font-semibold">Commitment currency</h2>
        <DocumentCurrencyFields
          baseCurrencyCode={currency}
          currencies={currencies}
          rates={rates}
          currencyCode={currencyCode}
          exchangeRateToBase={exchangeRateToBase}
          exchangeRateDate={exchangeRateDate}
          exchangeRateSource={exchangeRateSource}
          relevantDate={quoteDate}
          disabled={status === "sent"}
          onChange={(field, value) => setValue(field, value)}
        />
        <p className="mt-3 text-xs text-muted-foreground">
          This is an operational commitment snapshot only. A later Purchase Invoice uses its own posting and VAT rate.
        </p>
      </section>

      <section className="form-section">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Line items</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Select an inventory item or enter free-text service details.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="globalTax" className="text-sm font-medium">
              Default Tax:
            </Label>
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

      <DocumentFormFooter onCancel={() => router.push(cancelHref)}>
        {status === "sent" ? (
          <Button permission={["save", "approve"]} type="button" disabled={isSubmitting} onClick={handleSubmit((values) => save(values, "issue"))}>
            {isSubmitting && <LoaderCircle className="size-4 animate-spin" />} Save Changes
          </Button>
        ) : (
          <Button permission={"save"}
            type="button"
            disabled={isSubmitting}
            onClick={handleSubmit((values) => save(values, "draft"))}
          >
            {isSubmitting && <LoaderCircle className="size-4 animate-spin" />} {quoteId ? "Save Draft" : "Save Draft Quote"}
          </Button>
        )}
      </DocumentFormFooter>
    </form>
  );
}
