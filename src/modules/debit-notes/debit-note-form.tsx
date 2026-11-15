"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney } from "@/core/format";
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
      projects.filter(
        (project) => !project.supplierId || project.supplierId === supplierId,
      ),
    [supplierId, projects],
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
  const exchangeRateDate =
    useWatch({ control, name: "exchangeRateDate" }) ||
    selected?.exchangeRateDate ||
    "";
  const exchangeRateSource =
    useWatch({ control, name: "exchangeRateSource" }) ||
    selected?.exchangeRateSource ||
    "Base";
  const minorUnit = selected?.minorUnit ?? 2;
  const resolvedExpenseAccounts = expenseAccounts ?? salesAccounts ?? [];
  const defaultExpense = resolvedExpenseAccounts[0]?.id ?? "";

  const supplierOptions = useMemo<ComboboxOption[]>(
    () => suppliers.map((s) => ({ value: s.id, label: s.name })),
    [suppliers],
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
                  }}
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
                    if (!invoice) return;
                    setValue("currencyCode", invoice.currencyCode);
                    setValue("exchangeRateToBase", invoice.exchangeRateToBase);
                    setValue("exchangeRateDate", invoice.exchangeRateDate);
                    setValue(
                      "exchangeRateSource",
                      invoice.exchangeRateSource as "Base" | "Manual" | "CBUAE",
                    );
                  }}
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

          <div className="space-y-1.5">
            <Label>Currency</Label>
            <div className="flex h-9 items-center rounded-[6px] border border-border bg-surface-muted/60 px-3 text-sm font-medium text-foreground">
              {currencyCode}
            </div>
            <input type="hidden" name="exchangeRateToBase" value={exchangeRateToBase} readOnly />
            <input type="hidden" name="exchangeRateDate" value={exchangeRateDate} readOnly />
            <input type="hidden" name="exchangeRateSource" value={exchangeRateSource} readOnly />
          </div>
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
  );
}
