"use client";
import { FormError } from "@/components/form-error";

import Link from "next/link";
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveBankAccountAction } from "./actions";
import { bankAccountInputSchema, type BankAccountInput } from "./bank-account-input";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { FieldError } from "@/components/ui/field-error";
import { fieldErrorProps, fieldErrorId, applyServerFieldErrors, focusFirstInvalidField } from "@/lib/form-errors";


export function BankAccountForm({ businessId, accountId, ledgerAccounts, initial }: {
  businessId: string; accountId?: string;
  ledgerAccounts: { id: string;  name: string; subtype: "bank" | "cash"; available: number }[];
  initial: BankAccountInput;
}) {
  const [serverError, setServerError] = useState("");
  const form = useForm<BankAccountInput>({
    resolver: zodResolver(bankAccountInputSchema),
    // Validate on submit, then live as the user corrects fields. Blur validation
    // inserted error text that shifted the Save button mid-click.
    mode: "onSubmit",
    reValidateMode: "onChange",
    defaultValues: initial,
  });
  const { register, control, handleSubmit, setValue, setError, formState: { errors, isSubmitting, isDirty, isSubmitSuccessful } } = form;
  useUnsavedChanges(isDirty && !isSubmitSuccessful);
  const isCash = useWatch({ control, name: "isCashAccount" });
  const mappedLedgerOptions = ledgerAccounts
    .filter((ledger) => ledger.available && (isCash ? ledger.subtype === "cash" : ledger.subtype === "bank"))
    .map((ledger) => ({ value: ledger.id, label: ledger.name }));
  async function save(values: BankAccountInput) {
    setServerError("");
    const result = await saveBankAccountAction(businessId, accountId ?? null, values);
    if (result.fieldErrors) applyServerFieldErrors(setError, result.fieldErrors);
    if (result.error) setServerError(result.error);
  }
  return <form onSubmit={handleSubmit(save, focusFirstInvalidField)} className="space-y-7" noValidate>
    {serverError && <FormError message={serverError} />}
    <section className="border-b border-border pb-7"><h2 className="text-base font-semibold">Account details</h2><div className="mt-5 grid gap-5 sm:grid-cols-2">
      <div className="space-y-1.5"><Label htmlFor="name">Account name</Label><Input id="name" {...register("name")} {...fieldErrorProps("name", errors.name)} /><FieldError name="name" message={errors.name?.message} /></div>
      <div className="space-y-1.5"><Label htmlFor="accountCode">Account code <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="accountCode" {...register("accountCode")} /></div>
      {!isCash && (
        <>
          <div className="space-y-1.5"><Label htmlFor="bankName">Bank name <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="bankName" {...register("bankName")} /></div>
          <div className="space-y-1.5"><Label htmlFor="accountNumberMasked">Masked account number <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="accountNumberMasked" placeholder="•••• 1234" {...register("accountNumberMasked")} /></div>
        </>
      )}
      <div className="space-y-1.5"><Label htmlFor="currencyCode">Currency</Label><Input id="currencyCode" readOnly className="bg-surface-muted" {...register("currencyCode")} /></div>
      <div className="space-y-1.5"><Label htmlFor="ledgerAccountId">Mapped GL account</Label><Controller control={control} name="ledgerAccountId" render={({ field }) => <Combobox ref={field.ref} id="ledgerAccountId" ariaLabel="Mapped GL account" ariaInvalid={!!errors.ledgerAccountId} ariaDescribedBy={errors.ledgerAccountId ? fieldErrorId("ledgerAccountId") : undefined} options={mappedLedgerOptions} value={field.value ?? ""} onValueChange={field.onChange} placeholder="Choose account" searchPlaceholder="Search ledger account..." />} /><FieldError name="ledgerAccountId" message={errors.ledgerAccountId?.message} /></div>
    </div></section>
    <div className="flex flex-wrap gap-5"><label className="flex items-center gap-2 text-sm cursor-pointer select-none"><Controller control={control} name="isCashAccount" render={({ field }) => <Checkbox checked={Boolean(field.value)} onCheckedChange={(c) => { const next = Boolean(c); field.onChange(next); if (next) { setValue("bankName", "", { shouldDirty: true }); setValue("accountNumberMasked", "", { shouldDirty: true }); } }} aria-label="Cash account" />} /> Cash account</label><label className="flex items-center gap-2 text-sm cursor-pointer select-none"><Controller control={control} name="isActive" render={({ field }) => <Checkbox checked={Boolean(field.value)} onCheckedChange={(c) => field.onChange(Boolean(c))} aria-label="Active" />} /> Active</label></div>
    <div className="sticky bottom-0 z-20 -mx-4 flex justify-between border-t border-border bg-surface/95 px-4 py-3 backdrop-blur-sm sm:mx-0 sm:rounded-t-lg sm:border-x"><Button asChild variant="ghost"><Link href={accountId ? `/b/${businessId}/banking/accounts/${accountId}` : `/b/${businessId}/banking/accounts`}>Cancel</Link></Button><Button permission={"save"} type="submit" disabled={isSubmitting}>{isSubmitting && <LoaderCircle className="size-4 animate-spin" />} {accountId ? "Save Changes" : "Create Bank Account"}</Button></div>
  </form>;
}
