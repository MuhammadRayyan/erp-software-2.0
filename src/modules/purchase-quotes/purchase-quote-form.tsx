"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { minorToCurrencyInput } from "@/modules/currency/conversion";
import { savePurchaseQuoteAction } from "./actions";
import { purchaseQuoteInputSchema, type PurchaseQuoteInput } from "./purchase-quote-input";
import type { PurchaseQuoteStatus } from "./purchase-quote-service";
import { DocumentCurrencyFields, type DocumentCurrencyOption, type DocumentRateOption } from "@/modules/currency/document-currency-fields";
import { DocumentFormFooter } from "@/components/document-form-footer";
import {
  DocumentColumnToggles,
  DocumentLineTable,
  DocumentWorkspaceLayout,
  IsolatedDocumentTotals,
  useDocumentColumnVisibility,
} from "@/components/documents";
import { broadcastLiveRefresh } from "@/components/use-live-refresh";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { useActionPermission } from "@/components/permissions-provider";
import type { CustomFieldInputDefinition } from "@/modules/custom-fields/custom-field-inputs";

type Option = { id: string; name: string; defaultCurrencyCode: string | null };
type AccountOption = { id: string; name: string };
type TaxOption = { id: string; name: string; rateBasisPoints: number; vatCategory?: string | null };
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
  lineCustomFields = [],
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
  lineCustomFields?: CustomFieldInputDefinition[];
}) {
  const router = useRouter();
  const canApprove = useActionPermission("approve");
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
    getValues,
    formState: { errors, isSubmitting, isDirty, isSubmitSuccessful },
  } = form;
  useUnsavedChanges(isDirty && !isSubmitSuccessful);
  const { fields, append, remove, insert, move } = useFieldArray({ control, name: "lines" });
  const colVis = useDocumentColumnVisibility({ lineTaxCodes: false, lines: initial.lines });

  function duplicateLine(index: number) {
    const currentLine = getValues(`lines.${index}`);
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
  const quoteDate = useWatch({ control, name: "date" }) || "";
  const minorUnit = currencies.find((entry) => entry.code === currencyCode)?.minorUnit ?? 2;
  const baseMinorUnit = currencies.find((entry) => entry.code === currency)?.minorUnit ?? 2;
  const defaultExpense = expenseAccounts[0]?.id ?? "";

  const supplierOptions = useMemo<ComboboxOption[]>(
    () => suppliers.map((s) => ({ value: s.id, label: s.name })),
    [suppliers],
  );
  const projectOptions = useMemo<ComboboxOption[]>(
    () => projects.map((p) => ({ value: p.id, label: `${p.code} — ${p.name}`, keywords: [p.code, p.name] })),
    [projects],
  );
  const taxOptions = useMemo<ComboboxOption[]>(
    () => taxCodes.map((t) => ({ value: t.id, label: t.name })),
    [taxCodes],
  );

  function updateGlobalTax(newTaxId: string) {
    if (!newTaxId) return;
    setGlobalTaxCodeId(newTaxId);
    const currentLines = getValues("lines") ?? [];
    currentLines.forEach((_, i) => setValue(`lines.${i}.taxCodeId`, newTaxId, { shouldDirty: true, shouldTouch: true }));
  }

  function selectItem(index: number, itemId: string) {
    const item = items.find((i) => i.id === itemId);
    if (!item) {
      setValue(`lines.${index}.expenseAccountId`, defaultExpense, { shouldDirty: true });
      return;
    }
    setValue(`lines.${index}.description`, item.name, { shouldDirty: true, shouldTouch: true });
    if (item.purchasePriceMinor != null) {
      setValue(
        `lines.${index}.unitPrice`,
        minorToCurrencyInput(item.purchasePriceMinor, minorUnit),
        { shouldDirty: true, shouldTouch: true },
      );
    }
    if (item.inventoryAssetAccountId) {
      setValue(`lines.${index}.expenseAccountId`, item.inventoryAssetAccountId, { shouldDirty: true });
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
    <DocumentWorkspaceLayout
      serverError={serverError}
      headerTitle="Quote details"
      headerSubtitle="Purchase quotes (RFQs) are operational supplier documents and never affect the ledger."
      headerBadge={
        <span className="text-xs text-muted-foreground font-medium bg-muted/60 px-2 py-0.5 rounded border border-border/50">
          Quote # Auto-allocated on save
        </span>
      }
      header={
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="supplierId">Supplier</Label>
            <Controller
              control={control}
              name="supplierId"
              render={({ field }) => (
                <Combobox
                  id="supplierId"
                  ariaLabel="Supplier"
                  ariaInvalid={!!errors.supplierId}
                  options={supplierOptions}
                  value={field.value ?? ""}
                  onValueChange={(next) => {
                    field.onChange(next);
                    if (status === "draft" && next) {
                      const code = suppliers.find((s) => s.id === next)?.defaultCurrencyCode ?? currency;
                      setValue("currencyCode", code);
                      setValue("exchangeRateToBase", code === currency ? "1" : "");
                      setValue("exchangeRateDate", code === currency ? quoteDate : "");
                      setValue("exchangeRateSource", code === currency ? "Base" : "");
                    }
                  }}
                  placeholder="Choose a supplier…"
                  searchPlaceholder="Search supplier..."
                />
              )}
            />
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

          <div className="space-y-1.5">
            <Label htmlFor="projectId">
              Project <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Controller
              control={control}
              name="projectId"
              render={({ field }) => (
                <Combobox
                  id="projectId"
                  ariaLabel="Project"
                  options={projectOptions}
                  value={field.value ?? ""}
                  onValueChange={field.onChange}
                  allowClear
                  clearLabel="No project"
                  placeholder="No project"
                  searchPlaceholder="Search project..."
                />
              )}
            />
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="reference">
              Supplier RFQ / Reference <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input id="reference" {...register("reference")} />
          </div>
        </div>
      }
      linesTitle="Line items"
      linesSubtitle="Select an inventory item or enter free-text service details."
      linesActions={
        <div className="flex items-center gap-2">
          <Label htmlFor="globalTax" className="text-sm font-medium whitespace-nowrap">Default Tax:</Label>
          <div className="w-44">
            <Combobox
              id="globalTax"
              options={taxOptions}
              value={globalTaxCodeId}
              onValueChange={updateGlobalTax}
              size="sm"
              placeholder="Default Tax"
              searchPlaceholder="Search tax..."
            />
          </div>
        </div>
      }
      lines={
        <DocumentLineTable
          register={register}
          control={control}
          setValue={setValue}
          errors={errors}
          fields={fields}
          onAppend={(custom) =>
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
              customFields: {},
              ...custom,
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
          taxCodes={taxCodes}
          projects={projects}
          lineCustomFields={lineCustomFields}
          currencyCode={currencyCode}
          minorUnit={minorUnit}
          showTotalsSection={false}
          {...colVis.tableProps}
        />
      }
      bottomLeft={
        <>
          <DocumentColumnToggles
            {...colVis.togglesProps}
            control={control}
            showAmountsIncludeTaxToggle
            className="max-w-none"
          />

          <div className="form-section grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="notes">
                Notes <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Textarea id="notes" rows={2} placeholder="Notes..." {...register("notes")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="terms">
                Terms &amp; conditions <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Textarea id="terms" rows={2} placeholder="Supplier terms and delivery conditions..." {...register("terms")} />
            </div>
          </div>
        </>
      }
      bottomRight={
        <IsolatedDocumentTotals
          control={control}
          taxCodes={taxCodes}
          currencyCode={currencyCode}
          minorUnit={minorUnit}
          baseCurrencyCode={currency}
          baseMinorUnit={baseMinorUnit}
          exchangeRateToBase={exchangeRateToBase}
        />
      }
      footer={
        <DocumentFormFooter
          onCancel={() => router.push(cancelHref)}
          status={status}
          liveTotals={{
            control,
            taxCodes,
            currencyCode,
            minorUnit,
          }}
        >
          {status === "sent" ? (
            <Button permission={["save", "approve"]} type="button" disabled={isSubmitting} onClick={handleSubmit((values) => save(values, "issue"))}>
              {isSubmitting && <LoaderCircle className="size-4 animate-spin" />} Save Changes
            </Button>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Button permission={"save"} variant={canApprove ? "secondary" : "primary"} type="button" disabled={isSubmitting} onClick={handleSubmit((values) => save(values, "draft"))}>
                {isSubmitting && <LoaderCircle className="size-4 animate-spin" />} {quoteId ? "Save Draft" : "Save Draft Quote"}
              </Button>
              {canApprove && (
                <Button permission={["save", "approve"]} type="button" disabled={isSubmitting} onClick={handleSubmit((values) => save(values, "issue"))}>
                  {isSubmitting && <LoaderCircle className="size-4 animate-spin" />} Save &amp; Issue
                </Button>
              )}
            </div>
          )}
        </DocumentFormFooter>
      }
    />
  );
}
