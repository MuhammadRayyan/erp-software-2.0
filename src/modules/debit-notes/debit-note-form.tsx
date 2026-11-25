"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney, getCurrencyMinorUnit } from "@/core/format";
import { saveDebitNoteAction } from "./actions";
import {
  debitNoteInputSchema,
  type DebitNoteInput,
} from "./debit-note-input";
import type { DebitNoteStatus } from "./debit-note-service";
import { DocumentFormFooter } from "@/components/document-form-footer";
import {
  DocumentColumnToggles,
  DocumentLineTable,
  DocumentWorkspaceLayout,
  IsolatedDocumentTotals,
  useDocumentColumnVisibility,
} from "@/components/documents";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { useActionPermission } from "@/components/permissions-provider";
import {
  QuickCreateProjectDialog,
  QuickCreateSupplierDialog,
} from "@/components/documents/quick-create-modals";

type Option = { id: string; name: string };
type AccountOption = { id: string; name: string };
type TaxOption = { id: string; name: string; rateBasisPoints: number; vatCategory?: string | null };
type InvoiceOption = {
  id: string;
  invoiceNumber: string;
  supplierId: string;
  balanceMinor: number;
  currencyCode: string;
  minorUnit: number;
  exchangeRateToBase: string;
  exchangeRateDate: string;
  exchangeRateSource: string;
};
type ProjectOption = {
  id: string;
  code: string;
  name: string;
  supplierId: string | null;
};

export function DebitNoteForm({
  businessId,
  noteId,
  documentStatus = "draft",
  suppliers,
  invoices,
  salesAccounts,
  expenseAccounts,
  taxCodes,
  projects,
  currency,
  initial,
}: {
  businessId: string;
  noteId?: string;
  documentStatus?: DebitNoteStatus;
  suppliers: Option[];
  invoices: InvoiceOption[];
  salesAccounts?: AccountOption[];
  expenseAccounts?: AccountOption[];
  taxCodes: TaxOption[];
  projects: ProjectOption[];
  currency: string;
  initial: DebitNoteInput;
}) {
  const router = useRouter();
  const canCreateSupplier = useActionPermission("create", "purchases");
  const canCreateProject = useActionPermission("create", "projects");
  const [supplierList, setSupplierList] = useState(suppliers);
  useEffect(() => {
    setSupplierList(suppliers);
  }, [suppliers]);
  const [projectList, setProjectList] = useState(projects);
  useEffect(() => {
    setProjectList(projects);
  }, [projects]);
  const [quickCreateSupplierOpen, setQuickCreateSupplierOpen] = useState(false);
  const [quickCreateSupplierSeed, setQuickCreateSupplierSeed] = useState("");
  const [quickCreateProjectOpen, setQuickCreateProjectOpen] = useState(false);
  const [quickCreateProjectSeed, setQuickCreateProjectSeed] = useState("");
  const [serverError, setServerError] = useState("");
  const [globalTaxCodeId, setGlobalTaxCodeId] = useState(
    () =>
      initial.lines[0]?.taxCodeId ||
      taxCodes.find((taxCode) => taxCode.rateBasisPoints === 500)?.id ||
      taxCodes[0]?.id ||
      ""
  );
  const form = useForm<DebitNoteInput>({
    resolver: zodResolver(debitNoteInputSchema),
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
  const colVis = useDocumentColumnVisibility({ lineTaxCodes: true, lines: initial.lines });

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
  const invoiceId = useWatch({ control, name: "purchaseInvoiceId" });
  const eligibleInvoices = useMemo(
    () => invoices.filter((invoice) => invoice.supplierId === supplierId),
    [supplierId, invoices],
  );
  const eligibleProjects = useMemo(
    () =>
      projectList.filter(
        (project) => !project.supplierId || project.supplierId === supplierId,
      ),
    [supplierId, projectList],
  );
  const selected = invoices.find((invoice) => invoice.id === invoiceId);
  const currencyCode =
    useWatch({ control, name: "currencyCode" }) ||
    selected?.currencyCode ||
    currency;
  const exchangeRateToBase =
    useWatch({ control, name: "exchangeRateToBase" }) ||
    selected?.exchangeRateToBase ||
    "1";
  const exchangeRateSource =
    useWatch({ control, name: "exchangeRateSource" }) ||
    selected?.exchangeRateSource ||
    "Base";
  const minorUnit = selected?.minorUnit ?? getCurrencyMinorUnit(currencyCode);
  const resolvedExpenseAccounts = expenseAccounts ?? salesAccounts ?? [];
  const defaultExpense = resolvedExpenseAccounts[0]?.id ?? "";

  const supplierOptions = useMemo<ComboboxOption[]>(
    () => supplierList.map((s) => ({ value: s.id, label: s.name })),
    [supplierList],
  );
  const invoiceOptions = useMemo<ComboboxOption[]>(
    () =>
      eligibleInvoices.map((invoice) => ({
        value: invoice.id,
        label: invoice.invoiceNumber,
        badge: `${formatMoney(invoice.balanceMinor, invoice.currencyCode, invoice.minorUnit)} remaining`,
      })),
    [eligibleInvoices],
  );
  const projectOptions = useMemo<ComboboxOption[]>(
    () => eligibleProjects.map((p) => ({ value: p.id, label: `${p.code} — ${p.name}`, keywords: [p.code, p.name] })),
    [eligibleProjects],
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

  async function save(values: DebitNoteInput, intent: "draft" | "post") {
    setServerError("");
    const result = await saveDebitNoteAction(
      businessId,
      noteId ?? null,
      values,
      intent,
    );
    if (result.fieldErrors)
      for (const [field, messages] of Object.entries(result.fieldErrors))
        setError(field as keyof DebitNoteInput, { message: messages[0] });
    if (result.error) setServerError(result.error);
  }

  const cancelHref = noteId
    ? `/b/${businessId}/purchases/debit-notes/${noteId}`
    : `/b/${businessId}/purchases/debit-notes`;

  return (
    <>
    <DocumentWorkspaceLayout
      serverError={serverError}
      headerTitle="Debit note details"
      headerSubtitle="A posted debit note reverses purchase expenses and input VAT while reducing Accounts Payable."
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
                    setValue("purchaseInvoiceId", "");
                    setValue("currencyCode", currency);
                    setValue("exchangeRateToBase", "1");
                    setValue("exchangeRateDate", getValues("date"));
                    setValue("exchangeRateSource", "Base");
                  }}
                  placeholder="Choose a supplier…"
                  searchPlaceholder="Search supplier..."
                  createAction={
                    canCreateSupplier
                      ? {
                          label: "New Supplier",
                          onTrigger: (query) => {
                            setQuickCreateSupplierSeed(query);
                            setQuickCreateSupplierOpen(true);
                          },
                        }
                      : undefined
                  }
                />
              )}
            />
            {errors.supplierId && (
              <p className="field-error">{errors.supplierId.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="purchaseInvoiceId">Apply to purchase bill</Label>
            <Controller
              control={control}
              name="purchaseInvoiceId"
              render={({ field }) => (
                <Combobox
                  id="purchaseInvoiceId"
                  ariaLabel="Apply to purchase bill"
                  ariaInvalid={!!errors.purchaseInvoiceId}
                  options={invoiceOptions}
                  value={field.value ?? ""}
                  onValueChange={(next) => {
                    field.onChange(next);
                    const invoice = invoices.find((entry) => entry.id === next);
                    if (!invoice) {
                      setValue("currencyCode", currency);
                      setValue("exchangeRateToBase", "1");
                      setValue("exchangeRateDate", getValues("date"));
                      setValue("exchangeRateSource", "Base");
                      return;
                    }
                    setValue("currencyCode", invoice.currencyCode);
                    setValue("exchangeRateToBase", invoice.exchangeRateToBase);
                    setValue("exchangeRateDate", invoice.exchangeRateDate);
                    setValue(
                      "exchangeRateSource",
                      invoice.exchangeRateSource as "Base" | "Manual" | "CBUAE",
                    );
                  }}
                  allowClear
                  clearLabel="Standalone (no bill)"
                  placeholder="Choose a posted bill…"
                  searchPlaceholder="Search purchase bill..."
                  emptyText={supplierId ? "No posted open bills for supplier." : "Select a supplier first."}
                />
              )}
            />
            {selected && (
              <p className="text-xs text-muted-foreground">
                Maximum debit {formatMoney(selected.balanceMinor, selected.currencyCode, selected.minorUnit)}
              </p>
            )}
            {errors.purchaseInvoiceId && (
              <p className="field-error">{errors.purchaseInvoiceId.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="date">Debit note date</Label>
            <Input
              id="date"
              type="date"
              {...register("date")}
              aria-invalid={!!errors.date}
            />
            {errors.date && <p className="field-error">{errors.date.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="taxDate">VAT tax date</Label>
            <Input
              id="taxDate"
              type="date"
              {...register("taxDate")}
              aria-invalid={!!errors.taxDate}
            />
            {errors.taxDate && <p className="field-error">{errors.taxDate.message}</p>}
          </div>

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
                  createAction={
                    canCreateProject
                      ? {
                          label: "New Project",
                          onTrigger: (query) => {
                            setQuickCreateProjectSeed(query);
                            setQuickCreateProjectOpen(true);
                          },
                        }
                      : undefined
                  }
                />
              )}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reference">
              Reference <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input id="reference" {...register("reference")} />
          </div>

          {currencyCode !== currency && (
            <div className="md:col-span-3">
              <span className="inline-flex items-center rounded-md border border-border bg-surface-muted/50 px-2.5 py-1 text-xs font-medium text-muted-foreground">
                Foreign currency: {currencyCode} (1 {currencyCode} = {exchangeRateToBase} {currency} · {exchangeRateSource})
              </span>
            </div>
          )}
        </div>
      }
      linesTitle="Debited items"
      linesSubtitle="Use the original expense, VAT, and Project allocations for a clean reversal."
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
          accounts={resolvedExpenseAccounts}
          accountFieldName="expenseAccountId"
          accountColumnLabel="Expense account"
          accountAriaLabel="expense account"
          accountPlaceholder="Choose an account..."
          taxCodes={taxCodes}
          projects={eligibleProjects}
          currencyCode={currencyCode}
          minorUnit={minorUnit}
          showTotalsSection={false}
          {...colVis.tableProps}
        />
      }
      bottomLeft={
        <DocumentColumnToggles
          {...colVis.togglesProps}
          control={control}
          showAmountsIncludeTaxToggle
          className="max-w-none"
        />
      }
      bottomRight={
        <IsolatedDocumentTotals
          control={control}
          taxCodes={taxCodes}
          currencyCode={currencyCode}
          minorUnit={minorUnit}
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
          }}
        >
          {documentStatus === "posted" ? (
            <Button
              permission={["save", "post"]}
              type="button"
              disabled={isSubmitting}
              onClick={handleSubmit((values) => save(values, "post"))}
            >
              {isSubmitting && <LoaderCircle className="size-4 animate-spin" />}{" "}
              Update Posted Debit Note
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button
                permission={"save"}
                type="button"
                variant="secondary"
                disabled={isSubmitting}
                onClick={handleSubmit((values) => save(values, "draft"))}
              >
                Save Draft
              </Button>
              <Button
                permission={["save", "post"]}
                type="button"
                disabled={isSubmitting}
                onClick={handleSubmit((values) => save(values, "post"))}
              >
                {isSubmitting && <LoaderCircle className="size-4 animate-spin" />}{" "}
                Post Debit Note
              </Button>
            </div>
          )}
        </DocumentFormFooter>
      }
    />
    <QuickCreateSupplierDialog
      businessId={businessId}
      open={quickCreateSupplierOpen}
      onOpenChange={setQuickCreateSupplierOpen}
      initialName={quickCreateSupplierSeed}
      defaultCurrencyCode={currencyCode}
      onCreated={(created) => {
        setSupplierList((prev) =>
          prev.some((s) => s.id === created.id) ? prev : [...prev, { id: created.id, name: created.name }],
        );
        setValue("supplierId", created.id, { shouldValidate: true, shouldDirty: true });
        setValue("purchaseInvoiceId", "");
      }}
    />
    <QuickCreateProjectDialog
      businessId={businessId}
      open={quickCreateProjectOpen}
      onOpenChange={setQuickCreateProjectOpen}
      initialName={quickCreateProjectSeed}
      onCreated={(created) => {
        setProjectList((prev) =>
          prev.some((p) => p.id === created.id)
            ? prev
            : [
                ...prev,
                {
                  id: created.id,
                  code: created.code,
                  name: created.name,
                  supplierId: null,
                },
              ],
        );
        setValue("projectId", created.id, { shouldValidate: true, shouldDirty: true });
      }}
    />
    </>
  );
}
