"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Coins, LoaderCircle } from "lucide-react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { SplitActionButton } from "@/components/ui/split-action-button";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { formatDate, formatMoney } from "@/core/format";
import { minorToCurrencyInput } from "@/modules/currency/conversion";
import { DocumentCurrencyFields, type DocumentCurrencyOption, type DocumentRateOption } from "@/modules/currency/document-currency-fields";
import { CustomFieldInputs, type CustomFieldInputDefinition } from "@/modules/custom-fields/custom-field-inputs";
import {
  buildInitialCustomFieldValues,
  firstMissingRequiredCustomField,
  haveCustomFieldValuesChanged,
} from "@/modules/custom-fields/custom-field-display";
import { createInvoiceAction, updateInvoiceAction } from "./actions";
import { invoiceInputSchema, type InvoiceInput } from "./invoice-input";
import type { DocumentStatus, InvoiceSaveIntent } from "./invoice-service";
import { emirateLabels, emirates } from "@/modules/tax/uae-vat-config";
import { DocumentFormFooter } from "@/components/document-form-footer";
import { SelectNative } from "@/components/ui/select-native";
import {
  DocumentColumnToggles,
  DocumentLineTable,
  DocumentWorkspaceLayout,
  IsolatedDocumentTotals,
  useDocumentColumnVisibility,
} from "@/components/documents";
import { DraftRecoveryBanner } from "@/components/documents/draft-recovery-banner";
import {
  QuickCreateCustomerDialog,
  QuickCreateItemDialog,
  QuickCreateProjectDialog,
} from "@/components/documents/quick-create-modals";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { useFormDraftRecovery } from "@/hooks/use-form-draft-recovery";
import { useActionPermission, useApprovalPolicy } from "@/components/permissions-provider";

type CustomerOption = { id: string; name: string; defaultCurrencyCode: string | null; paymentTermsDays: number; creditLimitMinor: number | null };
type AccountOption = { id: string; name: string };
type TaxCodeOption = { id: string; name: string; rateBasisPoints: number; vatCategory?: string | null };
type ProjectOption = { id: string; code: string; name: string; customerId: string | null };
type ItemOption = { id: string; sku: string | null; name: string; salesPriceMinor: number | null; salesAccountId: string };
type OrderOption = { id: string; orderNumber: string; customerId: string; date?: string };
type QuoteOption = { id: string; quoteNumber: string; customerId: string; date?: string };
export type CustomerCreditOption = { receiptId: string; receiptNumber: string; date: string; currencyCode: string; currencyMinorUnit: number; unallocatedAmountMinor: number };

export function InvoiceForm({
  onDefaultSave,
  businessId,
  invoiceId,
  isPrefilled = false,
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
  lineCustomFields = [],
}: {
  onDefaultSave?: (values: any, customValues: Record<string, string>) => Promise<{ error?: string; fieldErrors?: any } | undefined>;
  businessId: string;
  invoiceId?: string;
  isPrefilled?: boolean;
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
  lineCustomFields?: CustomFieldInputDefinition[];
}) {
  const router = useRouter();
  const { requiresApproval } = useApprovalPolicy();
  const canPost = useActionPermission("post");
  const canCreateCustomer = useActionPermission("create", "sales");
  const canCreateProject = useActionPermission("create", "projects");
  const canCreateItem = useActionPermission("create", "inventory");
  const mustSubmitForApproval = requiresApproval || !canPost;
  const [serverError, setServerError] = useState("");
  const [customerList, setCustomerList] = useState(customers);
  const [projectList, setProjectList] = useState(projects);
  const [itemList, setItemList] = useState(items);
  useEffect(() => { setCustomerList(customers); }, [customers]);
  useEffect(() => { setProjectList(projects); }, [projects]);
  useEffect(() => { setItemList(items); }, [items]);

  const [quickCustomerOpen, setQuickCustomerOpen] = useState(false);
  const [quickCustomerSeed, setQuickCustomerSeed] = useState("");
  const [quickProjectOpen, setQuickProjectOpen] = useState(false);
  const [quickProjectSeed, setQuickProjectSeed] = useState("");
  const [quickItemState, setQuickItemState] = useState<{ open: boolean; rowIndex: number; seed: string }>({
    open: false,
    rowIndex: 0,
    seed: "",
  });

  const initialCustomValues = useMemo(
    () => buildInitialCustomFieldValues(customFields, customFieldValues),
    [customFields, customFieldValues],
  );
  const [customValues, setCustomValues] = useState<Record<string, string>>(initialCustomValues);
  const [globalTaxCodeId, setGlobalTaxCodeId] = useState(
    () => initial.lines[0]?.taxCodeId || taxCodes.find((taxCode) => taxCode.rateBasisPoints === 500)?.id || taxCodes[0]?.id || "",
  );
  const form = useForm<InvoiceInput>({
    resolver: zodResolver(invoiceInputSchema),
    mode: "onTouched",
    defaultValues: initial,
  });
  const { register, control, handleSubmit, reset, watch, setError, setValue, getValues, formState: { errors, isSubmitting, isDirty, isSubmitSuccessful } } = form;
  const customDirty = haveCustomFieldValuesChanged(initialCustomValues, customValues);
  useUnsavedChanges((isDirty || customDirty) && !isSubmitSuccessful);
  const draftRecovery = useFormDraftRecovery({
    storageKey: `erp-draft:${businessId}:sales-invoice:new`,
    enabled: !invoiceId && !onDefaultSave && !isPrefilled,
    watch,
    reset,
    isDirty,
    isSubmitSuccessful,
  });
  const { fields, append, remove, insert, move } = useFieldArray({ control, name: "lines" });
  const colVis = useDocumentColumnVisibility({ lines: initial.lines });

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

  const customerId = useWatch({ control, name: "customerId" });
  const currencyCode = useWatch({ control, name: "currencyCode" }) || currency;
  const exchangeRateToBase = useWatch({ control, name: "exchangeRateToBase" }) || "";
  const exchangeRateDate = useWatch({ control, name: "exchangeRateDate" }) || "";
  const exchangeRateSource = useWatch({ control, name: "exchangeRateSource" }) || "";
  const invoiceDate = useWatch({ control, name: "invoiceDate" }) || "";
  const taxDate = useWatch({ control, name: "taxDate" }) || invoiceDate;
  const applyAvailableCredit = useWatch({ control, name: "applyAvailableCredit" });
  const minorUnit = currencies.find((entry) => entry.code === currencyCode)?.minorUnit ?? 2;
  const baseMinorUnit = currencies.find((entry) => entry.code === currency)?.minorUnit ?? 2;

  const availableProjects = useMemo(
    () =>
      projectList.filter((project) => {
        if (!customerId) return true;
        const cids = (project as any).customerIds as string[] | undefined;
        if (cids && cids.length > 0) return cids.includes(customerId);
        return !project.customerId || project.customerId === customerId;
      }),
    [projectList, customerId],
  );
  const availableOrders = useMemo(
    () => (orders ?? []).filter((o) => !customerId || o.customerId === customerId),
    [orders, customerId],
  );
  const availableQuotes = useMemo(
    () => (quotes ?? []).filter((q) => !customerId || q.customerId === customerId),
    [quotes, customerId],
  );

  const currentCustomerCredits = (availableCustomerCredits?.[customerId] || []).filter((c) => c.currencyCode === currencyCode);
  const totalAvailableCreditMinor = currentCustomerCredits.reduce((s, c) => s + c.unallocatedAmountMinor, 0);
  const availableCreditForTotals = !invoiceId && applyAvailableCredit && totalAvailableCreditMinor > 0 ? totalAvailableCreditMinor : 0;

  const customerOptions = useMemo<ComboboxOption[]>(
    () => customerList.map((c) => ({ value: c.id, label: c.name })),
    [customerList],
  );
  const orderOptions = useMemo<ComboboxOption[]>(
    () => availableOrders.map((o) => ({ value: o.id, label: o.orderNumber, description: o.date ? formatDate(o.date) : undefined })),
    [availableOrders],
  );
  const quoteOptions = useMemo<ComboboxOption[]>(
    () => availableQuotes.map((q) => ({ value: q.id, label: q.quoteNumber, description: q.date ? formatDate(q.date) : undefined })),
    [availableQuotes],
  );
  const projectOptions = useMemo<ComboboxOption[]>(
    () => availableProjects.map((p) => ({ value: p.id, label: `${p.code} — ${p.name}`, keywords: [p.code, p.name] })),
    [availableProjects],
  );
  const taxOptions = useMemo<ComboboxOption[]>(
    () => taxCodes.map((t) => ({ value: t.id, label: t.name })),
    [taxCodes],
  );

  const cancelHref = invoiceId ? `/b/${businessId}/sales/invoices/${invoiceId}` : `/b/${businessId}/sales/invoices`;
  const defaultSalesAccountId = salesAccounts[0]?.id ?? "";

  function handleCustomerChange(newCustomerId: string, sourceCustomers = customerList) {
    if (documentStatus === "draft" && newCustomerId) {
      const customer = sourceCustomers.find((c) => c.id === newCustomerId);
      const code = customer?.defaultCurrencyCode ?? currency;
      if (code !== getValues("currencyCode")) {
        setValue("currencyCode", code);
        setValue("exchangeRateToBase", code === currency ? "1" : "");
        setValue("exchangeRateDate", code === currency ? (taxDate || invoiceDate) : "");
        setValue("exchangeRateSource", code === currency ? "Base" : "");
      }
      if (customer?.paymentTermsDays) {
        const baseDate = invoiceDate || new Date().toISOString().slice(0, 10);
        const d = new Date(baseDate);
        if (!Number.isNaN(d.valueOf())) {
          d.setDate(d.getDate() + customer.paymentTermsDays);
          setValue("dueDate", d.toISOString().slice(0, 10));
        }
      }
    }
  }

  function updateGlobalTax(newTaxId: string) {
    if (!newTaxId) return;
    setGlobalTaxCodeId(newTaxId);
    const currentLines = getValues("lines") ?? [];
    currentLines.forEach((_, i) => setValue(`lines.${i}.taxCodeId`, newTaxId, { shouldDirty: true, shouldTouch: true }));
  }

  function selectItem(index: number, itemId: string, sourceItems = itemList) {
    const item = sourceItems.find((entry) => entry.id === itemId);
    if (!item) {
      setValue(`lines.${index}.salesAccountId`, defaultSalesAccountId, { shouldDirty: true });
      return;
    }
    setValue(`lines.${index}.description`, item.name, { shouldDirty: true, shouldTouch: true });
    setValue(`lines.${index}.unitPrice`, minorToCurrencyInput(item.salesPriceMinor ?? 0, minorUnit), { shouldDirty: true, shouldTouch: true });
    setValue(`lines.${index}.salesAccountId`, item.salesAccountId, { shouldDirty: true });
  }

  async function save(values: InvoiceInput, intent: InvoiceSaveIntent, afterSave: "view" | "new" | "email" = "view") {
    setServerError("");
    const missingCustomField = firstMissingRequiredCustomField(customFields, customValues);
    if (missingCustomField) {
      setServerError(`"${missingCustomField}" is required.`);
      return;
    }

    draftRecovery.clearDraft();

    if (onDefaultSave) {
      const result = await onDefaultSave(values, customValues);
      if (result?.fieldErrors || result?.error) {
        draftRecovery.preserveDraft(values);
      }
      if (result?.fieldErrors) {
        for (const [field, messages] of Object.entries(result.fieldErrors)) {
          setError(field as any, { message: (messages as string[])[0] });
        }
      }
      if (result?.error) {
        setError("root.serverError", { message: result.error });
        setServerError(result.error);
      }
      return;
    }

    const result = invoiceId
      ? await updateInvoiceAction(businessId, invoiceId, values, intent, customValues)
      : await createInvoiceAction(businessId, values, intent, customValues, afterSave);
    if (result.fieldErrors || result.error) {
      draftRecovery.preserveDraft(values);
    }
    if (result.fieldErrors) {
      for (const [field, messages] of Object.entries(result.fieldErrors)) {
        setError(field as any, { message: messages[0] });
      }
    }
    if (result.error) {
      setError("root.serverError", { message: result.error });
      setServerError(result.error);
    }
  }

  return (
    <>
    <DocumentWorkspaceLayout
      banner={
        <DraftRecoveryBanner
          hasDraft={draftRecovery.hasDraft}
          savedAt={draftRecovery.savedAt}
          onRestore={draftRecovery.restoreDraft}
          onDiscard={draftRecovery.discardDraft}
        />
      }
      serverError={serverError}
      headerTitle="Invoice details"
      headerBadge={
        !invoiceId ? (
          <span className="text-xs text-muted-foreground font-medium bg-muted/60 px-2 py-0.5 rounded border border-border/50">
            Invoice # Auto-allocated on save
          </span>
        ) : undefined
      }
      header={
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="customerId">Customer</Label>
            <Controller
              control={control}
              name="customerId"
              render={({ field }) => (
                <Combobox
                  id="customerId"
                  ariaLabel="Customer"
                  ariaInvalid={!!errors.customerId}
                  options={customerOptions}
                  value={field.value ?? ""}
                  onValueChange={(next) => {
                    field.onChange(next);
                    handleCustomerChange(next);
                  }}
                  createAction={
                    canCreateCustomer
                      ? {
                          label: "New Customer",
                          onTrigger: (q) => {
                            setQuickCustomerSeed(q);
                            setQuickCustomerOpen(true);
                          },
                        }
                      : undefined
                  }
                  placeholder="Choose a customer…"
                  searchPlaceholder="Search customer..."
                />
              )}
            />
            {errors.customerId && <p className="field-error">{errors.customerId.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="salesOrderId">Sales order <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Controller
              control={control}
              name="salesOrderId"
              render={({ field }) => (
                <Combobox
                  id="salesOrderId"
                  ariaLabel="Sales order"
                  options={orderOptions}
                  value={field.value ?? ""}
                  onValueChange={(next) => {
                    field.onChange(next);
                    const ord = orders?.find((item) => item.id === next);
                    if (ord) {
                      if (!getValues("customerId")) setValue("customerId", ord.customerId);
                      if (!getValues("reference")) setValue("reference", `Order ${ord.orderNumber}`);
                    }
                  }}
                  allowClear
                  clearLabel="No linked sales order"
                  placeholder="No linked sales order"
                  searchPlaceholder="Search order..."
                />
              )}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="quoteId">Sales quote <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Controller
              control={control}
              name="quoteId"
              render={({ field }) => (
                <Combobox
                  id="quoteId"
                  ariaLabel="Sales quote"
                  options={quoteOptions}
                  value={field.value ?? ""}
                  onValueChange={(next) => {
                    field.onChange(next);
                    const q = quotes?.find((item) => item.id === next);
                    if (q) {
                      if (!getValues("customerId")) setValue("customerId", q.customerId);
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

          {!invoiceId && totalAvailableCreditMinor > 0 && (
            <div className="md:col-span-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm dark:bg-emerald-950/25">
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
                <label className="flex items-center gap-2 cursor-pointer select-none font-medium text-emerald-900 dark:text-emerald-200">
                  <Controller
                    control={control}
                    name="applyAvailableCredit"
                    render={({ field }) => (
                      <Checkbox
                        checked={Boolean(field.value)}
                        onCheckedChange={(checked) => field.onChange(Boolean(checked))}
                        aria-label="Apply credit upon posting"
                      />
                    )}
                  />
                  <span className="text-xs sm:text-sm">Apply credit upon posting</span>
                </label>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="invoiceDate">Invoice date</Label>
            <Input
              id="invoiceDate"
              type="date"
              {...register("invoiceDate", {
                onChange: (event) => {
                  if (documentStatus === "draft") {
                    const customer = customerList.find((c) => c.id === customerId);
                    if (customer?.paymentTermsDays && event.target.value) {
                      const d = new Date(event.target.value);
                      if (!Number.isNaN(d.valueOf())) {
                        d.setDate(d.getDate() + customer.paymentTermsDays);
                        setValue("dueDate", d.toISOString().slice(0, 10));
                      }
                    }
                  }
                },
              })}
              aria-invalid={!!errors.invoiceDate}
            />
            {errors.invoiceDate && <p className="field-error">{errors.invoiceDate.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="taxDate">VAT tax date</Label>
            <Input id="taxDate" type="date" {...register("taxDate")} aria-invalid={!!errors.taxDate} />
            {errors.taxDate && <p className="field-error">{errors.taxDate.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="dueDate">Due date</Label>
            <Input id="dueDate" type="date" {...register("dueDate")} aria-invalid={!!errors.dueDate} />
            {errors.dueDate && <p className="field-error">{errors.dueDate.message}</p>}
          </div>

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

          <div className="space-y-1.5">
            <Label htmlFor="supplyEmirate">Supply Emirate</Label>
            <SelectNative id="supplyEmirate" {...register("supplyEmirate")}>
              <option value="">Use business default</option>
              {emirates.map((emirate) => (
                <option key={emirate} value={emirate}>{emirateLabels[emirate]}</option>
              ))}
            </SelectNative>
            <p className="text-xs text-muted-foreground">Reviewed for standard-rated Sales reporting.</p>
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
                  ariaInvalid={!!errors.projectId}
                  options={projectOptions}
                  value={field.value ?? ""}
                  onValueChange={field.onChange}
                  allowClear
                  clearLabel="No project"
                  createAction={
                    canCreateProject
                      ? {
                          label: "New Project",
                          onTrigger: (q) => {
                            setQuickProjectSeed(q);
                            setQuickProjectOpen(true);
                          },
                        }
                      : undefined
                  }
                  placeholder="No project"
                  searchPlaceholder="Search project..."
                />
              )}
            />
            {errors.projectId && <p className="field-error">{errors.projectId.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reference">Reference <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Input id="reference" {...register("reference")} />
          </div>
        </div>
      }
      linesTitle="Line items"
      linesSubtitle="Select an item for inventory sales, or leave it blank for a service line."
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
              salesAccountId: defaultSalesAccountId,
              taxCodeId: globalTaxCodeId,
              projectId: "",
              discountType: "none",
              discountValue: "0",
              ...custom,
            })
          }
          onRemove={remove}
          onDuplicate={duplicateLine}
          onMoveUp={moveLineUp}
          onMoveDown={moveLineDown}
          items={itemList}
          onItemSelect={selectItem}
          onRequestCreateItem={
            canCreateItem
              ? (rowIndex, q) => setQuickItemState({ open: true, rowIndex, seed: q })
              : undefined
          }
          accounts={salesAccounts}
          accountFieldName="salesAccountId"
          taxCodes={taxCodes}
          projects={availableProjects}
          currencyCode={currencyCode}
          minorUnit={minorUnit}
          lineCustomFields={lineCustomFields}
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
              <Textarea id="notes" rows={2} placeholder="Customer-facing notes..." {...register("notes")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="terms">Terms &amp; conditions <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <Textarea id="terms" rows={2} placeholder="Payment or warranty terms..." {...register("terms")} />
            </div>
          </div>

          {customFields.length > 0 && (
            <div className="form-section">
              <h3 className="text-sm font-semibold">Custom Fields</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">Fields defined in Settings → Custom Fields.</p>
              <CustomFieldInputs
                definitions={customFields}
                values={customValues}
                onChange={(definitionId, value) => setCustomValues((current) => ({ ...current, [definitionId]: value }))}
                className="mt-4 grid gap-4 sm:grid-cols-2"
              />
            </div>
          )}
        </>
      }
      bottomRight={
        <IsolatedDocumentTotals
          control={control}
          taxCodes={taxCodes}
          currencyCode={currencyCode}
          minorUnit={minorUnit}
          availableCreditMinor={availableCreditForTotals}
          creditLabel="Advance credit"
          baseCurrencyCode={currency}
          baseMinorUnit={baseMinorUnit}
          exchangeRateToBase={exchangeRateToBase}
        />
      }
      footer={
        <DocumentFormFooter
          onCancel={() => router.push(cancelHref)}
          status={documentStatus}
          liveTotals={{
            control,
            taxCodes,
            currencyCode,
            minorUnit,
            availableCreditMinor: availableCreditForTotals,
          }}
        >
          {documentStatus === "posted" ? (
            <Button permission={["save", "post"]} type="button" disabled={isSubmitting} onClick={handleSubmit((values) => save(values, "post"))}>
              {isSubmitting && <LoaderCircle className="size-4 animate-spin" />} Save Changes
            </Button>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Button permission={"save"} variant="secondary" type="button" disabled={isSubmitting} onClick={handleSubmit((values) => save(values, "draft"))}>
                {isSubmitting && <LoaderCircle className="size-4 animate-spin" />} {invoiceId ? "Save Draft" : "Save Draft Invoice"}
              </Button>
              {mustSubmitForApproval ? (
                <Button permission={"save"} type="button" disabled={isSubmitting} onClick={handleSubmit((values) => save(values, "submit_approval"))}>
                  {isSubmitting && <LoaderCircle className="size-4 animate-spin" />} Submit for Approval
                </Button>
              ) : !invoiceId && !onDefaultSave ? (
                <SplitActionButton
                  label="Create & Post"
                  permission={["save", "post"]}
                  loading={isSubmitting}
                  onPrimaryClick={handleSubmit((values) => save(values, "post", "view"))}
                  options={[
                    {
                      label: "Create, Post & New",
                      description: "Post this invoice and start a new one",
                      onSelect: handleSubmit((values) => save(values, "post", "new")),
                    },
                    {
                      label: "Create, Post & Email",
                      description: "Post and open the email composer",
                      permission: "export",
                      onSelect: handleSubmit((values) => save(values, "post", "email")),
                    },
                  ]}
                />
              ) : (
                <Button permission={["save", "post"]} type="button" disabled={isSubmitting} onClick={handleSubmit((values) => save(values, "post"))}>
                  {isSubmitting && <LoaderCircle className="size-4 animate-spin" />} {invoiceId ? "Save & Post" : "Create & Post"}
                </Button>
              )}
            </div>
          )}
        </DocumentFormFooter>
      }
    />
    <QuickCreateCustomerDialog
      businessId={businessId}
      open={quickCustomerOpen}
      onOpenChange={setQuickCustomerOpen}
      initialName={quickCustomerSeed}
      defaultCurrencyCode={currencyCode}
      onCreated={(created) => {
        const nextCustomer: CustomerOption = { ...created, creditLimitMinor: null };
        const nextList = [...customerList, nextCustomer];
        setCustomerList(nextList);
        setValue("customerId", created.id, { shouldDirty: true, shouldTouch: true });
        handleCustomerChange(created.id, nextList);
      }}
    />
    <QuickCreateProjectDialog
      businessId={businessId}
      open={quickProjectOpen}
      onOpenChange={setQuickProjectOpen}
      initialName={quickProjectSeed}
      defaultCustomerId={customerId ?? ""}
      customers={customerList}
      onCreated={(created) => {
        setProjectList((prev) => [...prev, created]);
        if (!created.customerId || !customerId || created.customerId === customerId) {
          setValue("projectId", created.id, { shouldDirty: true, shouldTouch: true });
        }
      }}
    />
    <QuickCreateItemDialog
      businessId={businessId}
      open={quickItemState.open}
      onOpenChange={(open) => setQuickItemState((prev) => ({ ...prev, open }))}
      initialName={quickItemState.seed}
      defaultMode="sales"
      onCreated={(created) => {
        const nextItem: ItemOption = {
          id: created.id,
          sku: created.sku,
          name: created.name,
          salesPriceMinor: created.salesPriceMinor,
          salesAccountId: created.salesAccountId,
        };
        const nextItems = [...itemList, nextItem];
        setItemList(nextItems);
        setValue(`lines.${quickItemState.rowIndex}.itemId`, created.id, { shouldDirty: true, shouldTouch: true });
        selectItem(quickItemState.rowIndex, created.id, nextItems);
      }}
    />
    </>
  );
}
