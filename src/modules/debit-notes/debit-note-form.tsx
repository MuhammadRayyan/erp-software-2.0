"use client";
import { useRouter } from "next/navigation";
import { FormError } from "@/components/form-error";
import { useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
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
import { SelectNative } from "@/components/ui/select-native";
import { DocumentLineTable, useDocumentTotals } from "@/components/documents";
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
    formState: { errors, isSubmitting, isDirty, isSubmitSuccessful },
  } = form;
  useUnsavedChanges(isDirty && !isSubmitSuccessful);
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
  const totals = useDocumentTotals<DebitNoteInput>({
    control,
    taxCodes,
    minorUnit,
  });
  const lines = totals.lines;
  const resolvedExpenseAccounts = expenseAccounts ?? salesAccounts ?? [];
  const defaultExpense = resolvedExpenseAccounts[0]?.id ?? "";
    
  function updateGlobalTax(newTaxId: string) {
    setGlobalTaxCodeId(newTaxId);
    lines.forEach((_, i) => form.setValue(`lines.${i}.taxCodeId`, newTaxId));
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
    <form className="space-y-5 max-w-none" noValidate>
      {serverError && <FormError message={serverError} />}
      <section className="form-section">
        <h2 className="text-base font-semibold">Debit note details</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          A posted debit note reverses purchase expenses and input VAT while reducing Accounts Payable.
        </p>
        <div className="mt-5 grid gap-5 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="supplierId">Supplier</Label>
            <SelectNative
              id="supplierId"
              {...register("supplierId", {
                onChange: () => setValue("purchaseInvoiceId", ""),
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
            <Label htmlFor="purchaseInvoiceId">Apply to purchase bill</Label>
            <SelectNative
              id="purchaseInvoiceId"
              {...register("purchaseInvoiceId", {
                onChange: (event) => {
                  const invoice = invoices.find(
                    (entry) => entry.id === event.target.value,
                  );
                  if (!invoice) return;
                  setValue("currencyCode", invoice.currencyCode);
                  setValue("exchangeRateToBase", invoice.exchangeRateToBase);
                  setValue("exchangeRateDate", invoice.exchangeRateDate);
                  setValue(
                    "exchangeRateSource",
                    invoice.exchangeRateSource as "Base" | "Manual" | "CBUAE",
                  );
                },
              })}
              aria-invalid={!!errors.purchaseInvoiceId}
            >
              <option value="">Choose a posted bill…</option>
              {eligibleInvoices.map((invoice) => (
                <option key={invoice.id} value={invoice.id}>
                  {invoice.invoiceNumber} ·{" "}
                  {formatMoney(
                    invoice.balanceMinor,
                    invoice.currencyCode,
                    invoice.minorUnit,
                  )}{" "}
                  remaining
                </option>
              ))}
            </SelectNative>
            {selected && (
              <p className="text-xs text-muted-foreground">
                Maximum debit{" "}
                {formatMoney(
                  selected.balanceMinor,
                  selected.currencyCode,
                  selected.minorUnit,
                )}
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
            {errors.date && (
              <p className="field-error">{errors.date.message}</p>
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
            <Label htmlFor="projectId">
              Project{" "}
              <span className="font-normal text-muted-foreground">
                (optional)
              </span>
            </Label>
            <SelectNative id="projectId" {...register("projectId")}>
              <option value="">No project</option>
              {eligibleProjects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.code} — {project.name}
                </option>
              ))}
            </SelectNative>
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
        </div>
      </section>
      <section className="form-section">
        <h2 className="text-base font-semibold">Inherited currency snapshot</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          A Debit Note always uses the linked invoice currency and original
          rate, so the correction does not manufacture an FX difference.
        </p>
        <dl className="mt-4 grid gap-3 rounded-lg border border-border bg-surface-raised p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-xs text-muted-foreground">Currency</dt>
            <dd className="mt-1 font-mono font-semibold">{currencyCode}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Rate</dt>
            <dd className="money mt-1">
              1 {currencyCode} = {exchangeRateToBase} {currency}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Rate date</dt>
            <dd className="mt-1">{exchangeRateDate || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Source</dt>
            <dd className="mt-1">{exchangeRateSource}</dd>
          </div>
        </dl>
      </section>
      
      
      <section className="form-section">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Debited items</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Use the original expense, VAT, and Project allocations for a clean reversal.
            </p>
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
          control={control}
          setValue={setValue}
          errors={errors}
          fields={fields}
          lines={lines}
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
          initialShowLineTaxCodes={true}
          projects={eligibleProjects}
          currencyCode={currencyCode}
          minorUnit={minorUnit}
          previews={totals.previews}
          amountsIncludeTax={totals.amountsIncludeTax}
          subtotalMinor={totals.subtotalMinor}
          taxMinor={totals.taxMinor}
          totalMinor={totals.totalMinor}
          registerAmountsIncludeTax={register("amountsIncludeTax")}
        />
      </section>

      <DocumentFormFooter
        onCancel={() => router.push(cancelHref)}
        status={documentStatus}
        totals={{
          subtotalMinor: totals.subtotalMinor,
          taxMinor: totals.taxMinor,
          totalMinor: totals.totalMinor,
          currencyCode,
          minorUnit,
        }}
      >
        {documentStatus === "posted" ? (
          <Button permission={["save", "post"]}
            type="button"
            disabled={isSubmitting}
            onClick={handleSubmit((values) => save(values, "post"))}
          >
            {isSubmitting && <LoaderCircle className="size-4 animate-spin" />}{" "}
            Update Posted Debit Note
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button permission={"save"}
              type="button"
              variant="secondary"
              disabled={isSubmitting}
              onClick={handleSubmit((values) => save(values, "draft"))}
            >
              Save Draft
            </Button>
            <Button permission={["save", "post"]}
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
    </form>
  );
}
