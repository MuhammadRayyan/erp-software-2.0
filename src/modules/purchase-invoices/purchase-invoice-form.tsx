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
import { formatDate, formatMoney, getBusinessTodayIso } from "@/core/format";
import { minorToCurrencyInput } from "@/modules/currency/conversion";
import { savePurchaseInvoiceAction } from "./actions";
import {
  purchaseInvoiceInputSchema,
  type PurchaseInvoiceInput,
} from "./purchase-invoice-input";
import type { PurchaseInvoiceIntent, PurchaseInvoiceStatus } from "./purchase-invoice-service";
import {
  DocumentCurrencyFields,
  type DocumentCurrencyOption,
  type DocumentRateOption,
} from "@/modules/currency/document-currency-fields";
import { DocumentFormFooter } from "@/components/document-form-footer";
import {
  DocumentColumnToggles,
  DocumentLineTable,
  DocumentWorkspaceLayout,
  IsolatedDocumentTotals,
  useDocumentColumnVisibility,
} from "@/components/documents";
import { DraftRecoveryBanner } from "@/components/documents/draft-recovery-banner";
import {
  QuickCreateItemDialog,
  QuickCreateProjectDialog,
  QuickCreateSupplierDialog,
} from "@/components/documents/quick-create-modals";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { useFormDraftRecovery } from "@/hooks/use-form-draft-recovery";
import { useActionPermission, useApprovalPolicy } from "@/components/permissions-provider";
import type { CustomFieldInputDefinition } from "@/modules/custom-fields/custom-field-inputs";
import { FieldError } from "@/components/ui/field-error";
import { fieldErrorProps, fieldErrorId, applyServerFieldErrors, focusFirstInvalidField } from "@/lib/form-errors";

type AccountOption = { id: string; name: string };
type TaxOption = {
  id: string;
  rateBasisPoints: number;
  name: string;
  vatCategory: string;
};
type Option = { id: string; name: string; defaultCurrencyCode?: string | null; paymentTermsDays?: number };
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
  isPrefilled = false,
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
  lineCustomFields = [],
}: {
  businessId: string;
  invoiceId?: string;
  isPrefilled?: boolean;
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
  lineCustomFields?: CustomFieldInputDefinition[];
}) {
  const router = useRouter();
  const { requiresApproval } = useApprovalPolicy();
  const canPost = useActionPermission("post");
  const canCreateSupplier = useActionPermission("create", "purchases");
  const canCreateProject = useActionPermission("create", "projects");
  const canCreateItem = useActionPermission("create", "inventory");
  const mustSubmitForApproval = requiresApproval || !canPost;
  const [serverError, setServerError] = useState("");
  const [supplierList, setSupplierList] = useState(suppliers);
  const [projectList, setProjectList] = useState(projects);
  const [itemList, setItemList] = useState(items);
  useEffect(() => { setSupplierList(suppliers); }, [suppliers]);
  useEffect(() => { setProjectList(projects); }, [projects]);
  useEffect(() => { setItemList(items); }, [items]);

  const [quickSupplierOpen, setQuickSupplierOpen] = useState(false);
  const [quickSupplierSeed, setQuickSupplierSeed] = useState("");
  const [quickProjectOpen, setQuickProjectOpen] = useState(false);
  const [quickProjectSeed, setQuickProjectSeed] = useState("");
  const [quickItemState, setQuickItemState] = useState<{ open: boolean; rowIndex: number; seed: string }>({
    open: false,
    rowIndex: 0,
    seed: "",
  });

  const [globalTaxCodeId, setGlobalTaxCodeId] = useState(
    () =>
      initial.lines[0]?.taxCodeId ||
      taxCodes.find((taxCode) => taxCode.rateBasisPoints === 500)?.id ||
      taxCodes[0]?.id ||
      ""
  );
  const form = useForm<PurchaseInvoiceInput>({
    resolver: zodResolver(purchaseInvoiceInputSchema),
    // Validate on submit, then live as the user corrects fields. Blur validation
    // inserted error text that shifted the Save button mid-click.
    mode: "onSubmit",
    reValidateMode: "onChange",
    defaultValues: initial,
  });
  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    setError,
    setValue,
    getValues,
    formState: { errors, isSubmitting, isDirty, isSubmitSuccessful },
  } = form;
  useUnsavedChanges(isDirty && !isSubmitSuccessful);
  const draftRecovery = useFormDraftRecovery({
    storageKey: `erp-draft:${businessId}:purchase-invoice:new`,
    enabled: !invoiceId && !isPrefilled,
    watch,
    reset,
    isDirty,
    isSubmitSuccessful,
  });
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
  const invoiceDate = useWatch({ control, name: "invoiceDate" }) || "";
  const taxDate = useWatch({ control, name: "taxDate" }) || invoiceDate;
  const applyAvailablePrepayment = useWatch({ control, name: "applyAvailablePrepayment" });
  const minorUnit = currencies.find((entry) => entry.code === currencyCode)?.minorUnit ?? 2;
  const baseMinorUnit = currencies.find((entry) => entry.code === currency)?.minorUnit ?? 2;

  const currentPrepayments: SupplierPrepaymentOption[] = (availableSupplierPrepayments?.[supplierId] || []).filter(
    (p: SupplierPrepaymentOption) => p.currencyCode === currencyCode
  );
  const totalAvailablePrepaymentMinor = currentPrepayments.reduce(
    (s: number, p: SupplierPrepaymentOption) => s + p.unallocatedAmountMinor,
    0
  );
  const availablePrepaymentForTotals =
    !invoiceId && applyAvailablePrepayment && totalAvailablePrepaymentMinor > 0
      ? totalAvailablePrepaymentMinor
      : 0;

  const supplierOptions = useMemo<ComboboxOption[]>(
    () => supplierList.map((s) => ({ value: s.id, label: s.name })),
    [supplierList],
  );
  const availableOrders = useMemo(
    () => orders.filter((order) => !supplierId || order.supplierId === supplierId),
    [orders, supplierId],
  );
  const orderOptions = useMemo<ComboboxOption[]>(
    () => availableOrders.map((order) => ({ value: order.id, label: order.orderNumber })),
    [availableOrders],
  );
  const projectOptions = useMemo<ComboboxOption[]>(
    () => projectList.map((p) => ({ value: p.id, label: `${p.code} — ${p.name}`, keywords: [p.code, p.name] })),
    [projectList],
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
  function selectItem(index: number, itemId: string, sourceItems = itemList) {
    const item = sourceItems.find((entry) => entry.id === itemId);
    if (!item) {
      setValue(`lines.${index}.expenseAccountId`, defaultExpense, { shouldDirty: true });
      return;
    }
    setValue(`lines.${index}.description`, item.name, { shouldDirty: true, shouldTouch: true });
    setValue(
      `lines.${index}.unitPrice`,
      minorToCurrencyInput(item.purchasePriceMinor ?? 0, minorUnit),
      { shouldDirty: true, shouldTouch: true },
    );
    setValue(
      `lines.${index}.expenseAccountId`,
      item.inventoryAssetAccountId,
      { shouldDirty: true },
    );
  }

  async function save(values: PurchaseInvoiceInput, intent: PurchaseInvoiceIntent, afterSave: "view" | "new" = "view") {
    setServerError("");
    draftRecovery.clearDraft();
    const result = await savePurchaseInvoiceAction(
      businessId,
      invoiceId ?? null,
      values,
      intent,
      afterSave,
    );
    if (result.fieldErrors || result.error) {
      draftRecovery.preserveDraft(values);
    }
    applyServerFieldErrors(setError, result.fieldErrors);
    if (result.error) {
      setError("root.serverError", { message: result.error });
      setServerError(result.error);
    }
  }

  const cancelHref = invoiceId
    ? `/b/${businessId}/purchases/invoices/${invoiceId}`
    : `/b/${businessId}/purchases/invoices`;

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
      headerTitle="Bill details"
      headerSubtitle="Posting creates the Accounts Payable, expense, and Input VAT journal atomically."
      headerBadge={
        !invoiceId ? (
          <span className="text-xs text-muted-foreground font-medium bg-muted/60 px-2 py-0.5 rounded border border-border/50">
            Internal Bill # Auto-allocated on save
          </span>
        ) : undefined
      }
      header={
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="supplierId">Supplier</Label>
            <Controller
              control={control}
              name="supplierId"
              render={({ field }) => (
                <Combobox ref={field.ref}
                  id="supplierId"
                  ariaLabel="Supplier"
                  ariaInvalid={!!errors.supplierId} ariaDescribedBy={errors.supplierId ? fieldErrorId("supplierId") : undefined}
                  options={supplierOptions}
                  value={field.value ?? ""}
                  onValueChange={(next) => {
                    field.onChange(next);
                    setValue("purchaseOrderId", "");
                    if (documentStatus === "draft" && next) {
                      const supplier = supplierList.find((s) => s.id === next);
                      const code = supplier?.defaultCurrencyCode ?? currency;
                      if (code !== getValues("currencyCode")) {
                        setValue("currencyCode", code);
                        setValue("exchangeRateToBase", code === currency ? "1" : "");
                        setValue("exchangeRateDate", code === currency ? taxDate || invoiceDate : "");
                        setValue("exchangeRateSource", code === currency ? "Base" : "");
                      }
                      if (typeof supplier?.paymentTermsDays === "number") {
                        const baseDate = invoiceDate || getBusinessTodayIso();
                        const d = new Date(baseDate);
                        if (!Number.isNaN(d.valueOf())) {
                          d.setDate(d.getDate() + supplier.paymentTermsDays);
                          setValue("dueDate", d.toISOString().slice(0, 10));
                        }
                      }
                    }
                  }}
                  createAction={
                    canCreateSupplier
                      ? {
                          label: "New Supplier",
                          onTrigger: (q) => {
                            setQuickSupplierSeed(q);
                            setQuickSupplierOpen(true);
                          },
                        }
                      : undefined
                  }
                  placeholder="Choose a supplier…"
                  searchPlaceholder="Search supplier..."
                />
              )}
            />
            {errors.supplierId && (
              <p className="field-error">{errors.supplierId.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="supplierInvoiceNumber">Supplier invoice #</Label>
            <Input
              id="supplierInvoiceNumber"
              {...register("supplierInvoiceNumber")}
              {...fieldErrorProps("supplierInvoiceNumber", errors.supplierInvoiceNumber)}
            />
            {errors.supplierInvoiceNumber && (
              <p className="field-error">{errors.supplierInvoiceNumber.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="purchaseOrderId">
              Purchase order <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Controller
              control={control}
              name="purchaseOrderId"
              render={({ field }) => (
                <Combobox ref={field.ref}
                  id="purchaseOrderId"
                  ariaLabel="Purchase order"
                  options={orderOptions}
                  value={field.value ?? ""}
                  onValueChange={(next) => {
                    field.onChange(next);
                    const ord = orders.find((o) => o.id === next);
                    if (ord) {
                      if (!getValues("supplierId")) setValue("supplierId", ord.supplierId);
                      if (!getValues("reference")) setValue("reference", `PO ${ord.orderNumber}`);
                    }
                  }}
                  allowClear
                  clearLabel="No linked order"
                  placeholder="No linked order"
                  searchPlaceholder="Search purchase order..."
                />
              )}
            />
          </div>

          {!invoiceId && totalAvailablePrepaymentMinor > 0 && (
            <div className="md:col-span-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm dark:bg-emerald-950/25">
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
                <label className="flex items-center gap-2 cursor-pointer select-none font-medium text-emerald-900 dark:text-emerald-200">
                  <Controller
                    control={control}
                    name="applyAvailablePrepayment"
                    render={({ field }) => (
                      <Checkbox
                        checked={Boolean(field.value)}
                        onCheckedChange={(checked) => field.onChange(Boolean(checked))}
                        aria-label="Apply prepayment upon posting"
                      />
                    )}
                  />
                  <span className="text-xs sm:text-sm">Apply prepayment upon posting</span>
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
                    const supplier = supplierList.find((s) => s.id === supplierId);
                    if (typeof supplier?.paymentTermsDays === "number" && event.target.value) {
                      const d = new Date(event.target.value);
                      if (!Number.isNaN(d.valueOf())) {
                        d.setDate(d.getDate() + supplier.paymentTermsDays);
                        setValue("dueDate", d.toISOString().slice(0, 10));
                      }
                    }
                  }
                },
              })}
              {...fieldErrorProps("invoiceDate", errors.invoiceDate)}
            />
            <FieldError name="invoiceDate" message={errors.invoiceDate?.message} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="taxDate">VAT tax date</Label>
            <Input
              id="taxDate"
              type="date"
              {...register("taxDate")}
              {...fieldErrorProps("taxDate", errors.taxDate)}
            />
            <FieldError name="taxDate" message={errors.taxDate?.message} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="dueDate">Due date</Label>
            <Input
              id="dueDate"
              type="date"
              {...register("dueDate")}
              {...fieldErrorProps("dueDate", errors.dueDate)}
            />
            <FieldError name="dueDate" message={errors.dueDate?.message} />
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
            <Label htmlFor="projectId">
              Project <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Controller
              control={control}
              name="projectId"
              render={({ field }) => (
                <Combobox ref={field.ref}
                  id="projectId"
                  ariaLabel="Project"
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
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="reference">
              Reference <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input id="reference" {...register("reference")} />
          </div>
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
          accounts={expenseAccounts}
          accountFieldName="expenseAccountId"
          accountAriaLabel="expense account"
          taxCodes={taxCodes}
          projects={projectList}
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
              <Label htmlFor="notes">
                Notes <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Textarea id="notes" rows={2} placeholder="Notes..." {...register("notes")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="terms">
                Terms &amp; conditions <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Textarea id="terms" rows={2} placeholder="Payment terms, delivery instructions..." {...register("terms")} />
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
          availableCreditMinor={availablePrepaymentForTotals}
          creditLabel="Supplier prepayment"
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
            availableCreditMinor: availablePrepaymentForTotals,
          }}
        >
          {documentStatus === "posted" ? (
            <Button
              permission={["save", "post"]}
              type="button"
              disabled={isSubmitting}
              onClick={handleSubmit((values) => save(values, "post"), focusFirstInvalidField)}
            >
              {isSubmitting && <LoaderCircle className="size-4 animate-spin" />} Save Changes
            </Button>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                permission={"save"}
                variant="secondary"
                type="button"
                disabled={isSubmitting}
                onClick={handleSubmit((values) => save(values, "draft"), focusFirstInvalidField)}
              >
                {isSubmitting && <LoaderCircle className="size-4 animate-spin" />}{" "}
                {invoiceId ? "Save Draft" : "Save Draft Bill"}
              </Button>
              {mustSubmitForApproval ? (
                <Button
                  permission={"save"}
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleSubmit((values) => save(values, "submit_approval"), focusFirstInvalidField)}
                >
                  {isSubmitting && <LoaderCircle className="size-4 animate-spin" />} Submit for Approval
                </Button>
              ) : !invoiceId ? (
                <SplitActionButton
                  label="Create & Post"
                  permission={["save", "post"]}
                  loading={isSubmitting}
                  onPrimaryClick={handleSubmit((values) => save(values, "post", "view"), focusFirstInvalidField)}
                  options={[
                    {
                      label: "Create, Post & New",
                      description: "Post this bill and start a new one right away",
                      onSelect: handleSubmit((values) => save(values, "post", "new"), focusFirstInvalidField),
                    },
                  ]}
                />
              ) : (
                <Button
                  permission={["save", "post"]}
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleSubmit((values) => save(values, "post"), focusFirstInvalidField)}
                >
                  {isSubmitting && <LoaderCircle className="size-4 animate-spin" />}{" "}
                  Save &amp; Post
                </Button>
              )}
            </div>
          )}
        </DocumentFormFooter>
      }
    />
    <QuickCreateSupplierDialog
      businessId={businessId}
      open={quickSupplierOpen}
      onOpenChange={setQuickSupplierOpen}
      initialName={quickSupplierSeed}
      defaultCurrencyCode={currencyCode}
      onCreated={(created) => {
        setSupplierList((prev) => [...prev, created]);
        setValue("supplierId", created.id, { shouldDirty: true, shouldTouch: true });
        setValue("purchaseOrderId", "");
        if (documentStatus === "draft") {
          const code = created.defaultCurrencyCode ?? currency;
          if (code !== getValues("currencyCode")) {
            setValue("currencyCode", code);
            setValue("exchangeRateToBase", code === currency ? "1" : "");
            setValue("exchangeRateDate", code === currency ? taxDate || invoiceDate : "");
            setValue("exchangeRateSource", code === currency ? "Base" : "");
          }
          if (typeof created.paymentTermsDays === "number") {
            const baseDate = invoiceDate || getBusinessTodayIso();
            const d = new Date(baseDate);
            if (!Number.isNaN(d.valueOf())) {
              d.setDate(d.getDate() + created.paymentTermsDays);
              setValue("dueDate", d.toISOString().slice(0, 10));
            }
          }
        }
      }}
    />
    <QuickCreateProjectDialog
      businessId={businessId}
      open={quickProjectOpen}
      onOpenChange={setQuickProjectOpen}
      initialName={quickProjectSeed}
      onCreated={(created) => {
        setProjectList((prev) => [...prev, created]);
        setValue("projectId", created.id, { shouldDirty: true, shouldTouch: true });
      }}
    />
    <QuickCreateItemDialog
      businessId={businessId}
      open={quickItemState.open}
      onOpenChange={(open) => setQuickItemState((prev) => ({ ...prev, open }))}
      initialName={quickItemState.seed}
      defaultMode="purchase"
      onCreated={(created) => {
        const nextItem: ItemOption = {
          id: created.id,
          sku: created.sku,
          name: created.name,
          purchasePriceMinor: created.purchasePriceMinor,
          inventoryAssetAccountId: created.inventoryAssetAccountId,
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
