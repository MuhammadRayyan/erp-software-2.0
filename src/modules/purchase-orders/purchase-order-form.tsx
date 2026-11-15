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
import { savePurchaseOrderAction } from "./actions";
import { purchaseOrderInputSchema, type PurchaseOrderInput } from "./purchase-order-input";
import type { PurchaseOrderIntent, PurchaseOrderStatus } from "./purchase-order-service";
import { DocumentCurrencyFields, type DocumentCurrencyOption, type DocumentRateOption } from "@/modules/currency/document-currency-fields";
import { DocumentFormFooter } from "@/components/document-form-footer";
import {
  DocumentColumnToggles,
  DocumentLineTable,
  DocumentWorkspaceLayout,
  IsolatedDocumentTotals,
  useDocumentColumnVisibility,
} from "@/components/documents";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { useActionPermission, useApprovalPolicy } from "@/components/permissions-provider";
import type { CustomFieldInputDefinition } from "@/modules/custom-fields/custom-field-inputs";

type Option = { id: string; name: string; defaultCurrencyCode: string | null };
type AccountOption = { id: string; name: string };
type TaxOption = { id: string; name: string; rateBasisPoints: number; vatCategory?: string | null };
type ProjectOption = { id: string; code: string; name: string };
type ItemOption = { id: string; sku: string | null; name: string; purchasePriceMinor: number | null; inventoryAssetAccountId: string };
type QuoteOption = { id: string; quoteNumber: string; supplierId: string; date?: string };

export function PurchaseOrderForm({ businessId, orderId, status = "draft", suppliers, expenseAccounts, taxCodes, projects, items, quotes, currency, currencies, rates, initial, lineCustomFields = [] }: { businessId: string; orderId?: string; status?: PurchaseOrderStatus; suppliers: Option[]; expenseAccounts: AccountOption[]; taxCodes: TaxOption[]; projects: ProjectOption[]; items: ItemOption[]; quotes?: QuoteOption[]; currency: string; currencies: DocumentCurrencyOption[]; rates: DocumentRateOption[]; initial: PurchaseOrderInput; lineCustomFields?: CustomFieldInputDefinition[] }) {
  const router = useRouter();
  const { requiresApproval } = useApprovalPolicy();
  const canApprove = useActionPermission("approve");
  const mustSubmitForApproval = requiresApproval || !canApprove;
  const [serverError, setServerError] = useState("");
  const [globalTaxCodeId, setGlobalTaxCodeId] = useState(() => initial.lines[0]?.taxCodeId || taxCodes.find((taxCode) => taxCode.rateBasisPoints === 500)?.id || taxCodes[0]?.id || "");
  const form = useForm<PurchaseOrderInput>({
    resolver: zodResolver(purchaseOrderInputSchema),
    mode: "onTouched",
    defaultValues: initial,
  });
  const { register, control, handleSubmit, setError, setValue, getValues, formState: { errors, isSubmitting, isDirty, isSubmitSuccessful } } = form;
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

  const supplierId = useWatch({ control, name: "supplierId" });
  const currencyCode = useWatch({ control, name: "currencyCode" }) || currency;
  const exchangeRateToBase = useWatch({ control, name: "exchangeRateToBase" }) || "";
  const exchangeRateDate = useWatch({ control, name: "exchangeRateDate" }) || "";
  const exchangeRateSource = useWatch({ control, name: "exchangeRateSource" }) || "";
  const orderDate = useWatch({ control, name: "date" }) || "";
  const minorUnit = currencies.find((entry) => entry.code === currencyCode)?.minorUnit ?? 2;
  const baseMinorUnit = currencies.find((entry) => entry.code === currency)?.minorUnit ?? 2;

  const availableQuotes = useMemo(
    () => (quotes ?? []).filter((q) => !supplierId || q.supplierId === supplierId),
    [quotes, supplierId],
  );
  const supplierOptions = useMemo<ComboboxOption[]>(
    () => suppliers.map((s) => ({ value: s.id, label: s.name })),
    [suppliers],
  );
  const quoteOptions = useMemo<ComboboxOption[]>(
    () => availableQuotes.map((q) => ({ value: q.id, label: q.quoteNumber, description: q.date })),
    [availableQuotes],
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

  const defaultExpense = expenseAccounts[0]?.id ?? "";
  function selectItem(index: number, itemId: string) {
    const item = items.find((i) => i.id === itemId);
    if (!item) {
      setValue(`lines.${index}.expenseAccountId`, defaultExpense, { shouldDirty: true });
      return;
    }
    setValue(`lines.${index}.description`, item.name, { shouldDirty: true, shouldTouch: true });
    if (item.purchasePriceMinor != null) {
      setValue(`lines.${index}.unitPrice`, minorToCurrencyInput(item.purchasePriceMinor, minorUnit), { shouldDirty: true, shouldTouch: true });
    }
    if (item.inventoryAssetAccountId) {
      setValue(`lines.${index}.expenseAccountId`, item.inventoryAssetAccountId, { shouldDirty: true });
    }
  }

  async function save(values: PurchaseOrderInput, intent: PurchaseOrderIntent) {
    setServerError("");
    const result = await savePurchaseOrderAction(businessId, orderId ?? null, values, intent);
    if (result.fieldErrors) for (const [field, messages] of Object.entries(result.fieldErrors)) setError(field as keyof PurchaseOrderInput, { message: messages[0] });
    if (result.error) setServerError(result.error);
  }

  const cancelHref = orderId ? `/b/${businessId}/purchases/orders/${orderId}` : `/b/${businessId}/purchases/orders`;

  return (
    <DocumentWorkspaceLayout
      serverError={serverError}
      headerTitle="Order details"
      headerSubtitle="Purchase orders are operational documents and never post to the ledger."
      headerBadge={
        <span className="text-xs text-muted-foreground font-medium bg-muted/60 px-2 py-0.5 rounded border border-border/50">
          Order # Auto-allocated on save
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
                      const code = suppliers.find((supplier) => supplier.id === next)?.defaultCurrencyCode ?? currency;
                      setValue("currencyCode", code);
                      setValue("exchangeRateToBase", code === currency ? "1" : "");
                      setValue("exchangeRateDate", code === currency ? orderDate : "");
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
            <Label htmlFor="purchaseQuoteId">Purchase quote <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Controller
              control={control}
              name="purchaseQuoteId"
              render={({ field }) => (
                <Combobox
                  id="purchaseQuoteId"
                  ariaLabel="Purchase quote"
                  options={quoteOptions}
                  value={field.value ?? ""}
                  onValueChange={(next) => {
                    field.onChange(next);
                    const q = quotes?.find((item) => item.id === next);
                    if (q) {
                      if (!getValues("supplierId")) setValue("supplierId", q.supplierId);
                      if (!getValues("reference")) setValue("reference", `Quote ${q.quoteNumber}`);
                    }
                  }}
                  allowClear
                  clearLabel="No linked quote"
                  placeholder="No linked quote"
                  searchPlaceholder="Search quote..."
                />
              )}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="date">Order date</Label>
            <Input id="date" type="date" {...register("date")} aria-invalid={!!errors.date} />
            {errors.date && <p className="field-error">{errors.date.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="expectedDate">Expected date <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Input id="expectedDate" type="date" {...register("expectedDate")} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="projectId">Project <span className="font-normal text-muted-foreground">(optional)</span></Label>
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

          <div className="space-y-1.5">
            <Label htmlFor="reference">Reference <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Input id="reference" {...register("reference")} />
          </div>

          <DocumentCurrencyFields
            baseCurrencyCode={currency}
            currencies={currencies}
            rates={rates}
            currencyCode={currencyCode}
            exchangeRateToBase={exchangeRateToBase}
            exchangeRateDate={exchangeRateDate}
            exchangeRateSource={exchangeRateSource}
            relevantDate={orderDate}
            disabled={status === "issued"}
            onChange={(field, value) => setValue(field, value)}
          />
        </div>
      }
      linesTitle="Line items"
      linesSubtitle="Select an item or service, or leave it blank for a service line."
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
              <Label htmlFor="notes">Notes <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <Textarea id="notes" rows={2} placeholder="Notes..." {...register("notes")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="terms">Terms &amp; conditions <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <Textarea id="terms" rows={2} placeholder="Purchase order delivery and payment terms..." {...register("terms")} />
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
          {status === "issued" ? (
            <Button permission={["save", "approve"]} type="button" disabled={isSubmitting} onClick={handleSubmit((values) => save(values, "issue"))}>
              {isSubmitting && <LoaderCircle className="size-4 animate-spin" />} Save Changes
            </Button>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Button permission={"save"} variant="secondary" type="button" disabled={isSubmitting} onClick={handleSubmit((values) => save(values, "draft"))}>
                {isSubmitting && <LoaderCircle className="size-4 animate-spin" />} {orderId ? "Save Draft" : "Save Draft Order"}
              </Button>
              {mustSubmitForApproval ? (
                <Button permission={"save"} type="button" disabled={isSubmitting} onClick={handleSubmit((values) => save(values, "submit_approval"))}>
                  {isSubmitting && <LoaderCircle className="size-4 animate-spin" />} Submit for Approval
                </Button>
              ) : (
                <Button permission={["save", "approve"]} type="button" disabled={isSubmitting} onClick={handleSubmit((values) => save(values, "issue"))}>
                  {isSubmitting && <LoaderCircle className="size-4 animate-spin" />} {orderId ? "Save & Issue" : "Create & Issue"}
                </Button>
              )}
            </div>
          )}
        </DocumentFormFooter>
      }
    />
  );
}
