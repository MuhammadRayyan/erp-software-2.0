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
import { saveCreditNoteAction } from "./actions";
import {
  creditNoteInputSchema,
  type CreditNoteInput,
} from "./credit-note-input";
import type { CreditNoteStatus } from "./credit-note-service";
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
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { useActionPermission } from "@/components/permissions-provider";
import {
  QuickCreateCustomerDialog,
  QuickCreateProjectDialog,
} from "@/components/documents/quick-create-modals";
import { FieldError } from "@/components/ui/field-error";
import { fieldErrorProps, fieldErrorId, applyServerFieldErrors, focusFirstInvalidField } from "@/lib/form-errors";

type Option = { id: string; name: string };
type AccountOption = { id: string; name: string };
type TaxOption = { id: string; name: string; rateBasisPoints: number; vatCategory?: string | null };
type InvoiceOption = {
  id: string;
  invoiceNumber: string;
  customerId: string;
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
  customerId: string | null;
};

export function CreditNoteForm({
  businessId,
  noteId,
  documentStatus = "draft",
  customers,
  invoices,
  salesAccounts,
  taxCodes,
  projects,
  currency,
  initial,
}: {
  businessId: string;
  noteId?: string;
  documentStatus?: CreditNoteStatus;
  customers: Option[];
  invoices: InvoiceOption[];
  salesAccounts: AccountOption[];
  taxCodes: TaxOption[];
  projects: ProjectOption[];
  currency: string;
  initial: CreditNoteInput;
}) {
  const router = useRouter();
  const canCreateCustomer = useActionPermission("create", "sales");
  const canCreateProject = useActionPermission("create", "projects");
  const [customerList, setCustomerList] = useState(customers);
  useEffect(() => {
    setCustomerList(customers);
  }, [customers]);
  const [projectList, setProjectList] = useState(projects);
  useEffect(() => {
    setProjectList(projects);
  }, [projects]);
  const [quickCreateCustomerOpen, setQuickCreateCustomerOpen] = useState(false);
  const [quickCreateCustomerSeed, setQuickCreateCustomerSeed] = useState("");
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
  const form = useForm<CreditNoteInput>({
    resolver: zodResolver(creditNoteInputSchema),
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

  const customerId = useWatch({ control, name: "customerId" });
  const invoiceId = useWatch({ control, name: "sourceInvoiceId" });
  const eligibleInvoices = useMemo(
    () => invoices.filter((invoice) => invoice.customerId === customerId),
    [customerId, invoices],
  );
  const eligibleProjects = useMemo(
    () =>
      projectList.filter((project) => {
        if (!customerId) return true;
        const cids = (project as any).customerIds as string[] | undefined;
        if (cids && cids.length > 0) return cids.includes(customerId);
        return !project.customerId || project.customerId === customerId;
      }),
    [customerId, projectList],
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
  const defaultSales = salesAccounts[0]?.id ?? "";

  const customerOptions = useMemo<ComboboxOption[]>(
    () => customerList.map((c) => ({ value: c.id, label: c.name })),
    [customerList],
  );
  const invoiceOptions = useMemo<ComboboxOption[]>(
    () =>
      eligibleInvoices.map((invoice) => ({
        value: invoice.id,
        label: invoice.invoiceNumber,
        badge: `${formatMoney(invoice.balanceMinor, invoice.currencyCode, invoice.minorUnit)} creditable`,
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

  async function save(values: CreditNoteInput, intent: "draft" | "post") {
    setServerError("");
    const result = await saveCreditNoteAction(
      businessId,
      noteId ?? null,
      values,
      intent,
    );
    applyServerFieldErrors(setError, result.fieldErrors);
    if (result.error) setServerError(result.error);
  }

  const cancelHref = noteId
    ? `/b/${businessId}/sales/credit-notes/${noteId}`
    : `/b/${businessId}/sales/credit-notes`;

  return (
    <>
    <DocumentWorkspaceLayout
      serverError={serverError}
      headerTitle="Credit details"
      headerSubtitle="A posted credit reverses Sales and output VAT while reducing Accounts Receivable."
      header={
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="customerId">Customer</Label>
            <Controller
              control={control}
              name="customerId"
              render={({ field }) => (
                <Combobox ref={field.ref}
                  id="customerId"
                  ariaLabel="Customer"
                  ariaInvalid={!!errors.customerId} ariaDescribedBy={errors.customerId ? fieldErrorId("customerId") : undefined}
                  options={customerOptions}
                  value={field.value ?? ""}
                  onValueChange={(next) => {
                    field.onChange(next);
                    setValue("sourceInvoiceId", "");
                    setValue("currencyCode", currency);
                    setValue("exchangeRateToBase", "1");
                    setValue("exchangeRateDate", getValues("date"));
                    setValue("exchangeRateSource", "Base");
                  }}
                  placeholder="Choose a customer…"
                  searchPlaceholder="Search customer..."
                  createAction={
                    canCreateCustomer
                      ? {
                          label: "New Customer",
                          onTrigger: (query) => {
                            setQuickCreateCustomerSeed(query);
                            setQuickCreateCustomerOpen(true);
                          },
                        }
                      : undefined
                  }
                />
              )}
            />
            {errors.customerId && (
              <p className="field-error">{errors.customerId.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sourceInvoiceId">Apply to invoice</Label>
            <Controller
              control={control}
              name="sourceInvoiceId"
              render={({ field }) => (
                <Combobox ref={field.ref}
                  id="sourceInvoiceId"
                  ariaLabel="Apply to invoice"
                  ariaInvalid={!!errors.sourceInvoiceId} ariaDescribedBy={errors.sourceInvoiceId ? fieldErrorId("sourceInvoiceId") : undefined}
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
                  placeholder="Choose a posted invoice…"
                  searchPlaceholder="Search invoice number..."
                  emptyText={customerId ? "No creditable posted invoices for customer." : "Select a customer first."}
                />
              )}
            />
            {selected && (
              <p className="text-xs text-muted-foreground">
                Maximum credit {formatMoney(selected.balanceMinor, selected.currencyCode, selected.minorUnit)}. Any part the invoice no longer owes (e.g. already paid) becomes customer credit you can apply or refund.
              </p>
            )}
            {errors.sourceInvoiceId && (
              <p className="field-error">{errors.sourceInvoiceId.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="date">Credit note date</Label>
            <Input
              id="date"
              type="date"
              {...register("date")}
              {...fieldErrorProps("date", errors.date)}
            />
            <FieldError name="date" message={errors.date?.message} />
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
            <Label htmlFor="supplyEmirate">Supply Emirate</Label>
            <SelectNative id="supplyEmirate" {...register("supplyEmirate")}>
              <option value="">Use business default</option>
              {emirates.map((emirate) => (
                <option key={emirate} value={emirate}>
                  {emirateLabels[emirate]}
                </option>
              ))}
            </SelectNative>
          </div>

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

          {currencyCode !== currency && (
            <div className="md:col-span-3">
              <span className="inline-flex items-center rounded-md border border-border bg-surface-muted/50 px-2.5 py-1 text-xs font-medium text-muted-foreground">
                Foreign currency: {currencyCode} (1 {currencyCode} = {exchangeRateToBase} {currency} · {exchangeRateSource})
              </span>
            </div>
          )}
        </div>
      }
      linesTitle="Credited items"
      linesSubtitle="Use the original revenue, VAT, and Project allocations for a clean reversal."
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
              salesAccountId: defaultSales,
              taxCodeId: globalTaxCodeId,
              projectId: "",
              ...custom,
            })
          }
          onRemove={remove}
          onDuplicate={duplicateLine}
          onMoveUp={moveLineUp}
          onMoveDown={moveLineDown}
          accounts={salesAccounts}
          accountFieldName="salesAccountId"
          accountAriaLabel="sales account"
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
        <>
          <DocumentColumnToggles
            {...colVis.togglesProps}
            control={control}
            showAmountsIncludeTaxToggle
            className="max-w-none"
          />
          <div className="form-section grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="reference">
                Reference <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input id="reference" {...register("reference")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reason">
                Reason <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input id="reason" {...register("reason")} />
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
            <Button permission={["save", "post"]}
              type="button"
              disabled={isSubmitting}
              onClick={handleSubmit((values) => save(values, "post"), focusFirstInvalidField)}
            >
              {isSubmitting && <LoaderCircle className="size-4 animate-spin" />}{" "}
              Update Posted Credit
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button permission={"save"}
                type="button"
                variant="secondary"
                disabled={isSubmitting}
                onClick={handleSubmit((values) => save(values, "draft"), focusFirstInvalidField)}
              >
                Save Draft
              </Button>
              <Button permission={["save", "post"]}
                type="button"
                disabled={isSubmitting}
                onClick={handleSubmit((values) => save(values, "post"), focusFirstInvalidField)}
              >
                {isSubmitting && <LoaderCircle className="size-4 animate-spin" />}{" "}
                Post Credit Note
              </Button>
            </div>
          )}
        </DocumentFormFooter>
      }
    />
    <QuickCreateCustomerDialog
      businessId={businessId}
      open={quickCreateCustomerOpen}
      onOpenChange={setQuickCreateCustomerOpen}
      initialName={quickCreateCustomerSeed}
      defaultCurrencyCode={currencyCode}
      onCreated={(created) => {
        setCustomerList((prev) =>
          prev.some((c) => c.id === created.id) ? prev : [...prev, { id: created.id, name: created.name }],
        );
        setValue("customerId", created.id, { shouldValidate: true, shouldDirty: true });
        setValue("sourceInvoiceId", "");
      }}
    />
    <QuickCreateProjectDialog
      businessId={businessId}
      open={quickCreateProjectOpen}
      onOpenChange={setQuickCreateProjectOpen}
      initialName={quickCreateProjectSeed}
      defaultCustomerId={customerId || undefined}
      customers={customerList}
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
                  customerId: created.customerId,
                },
              ],
        );
        setValue("projectId", created.id, { shouldValidate: true, shouldDirty: true });
      }}
    />
    </>
  );
}
