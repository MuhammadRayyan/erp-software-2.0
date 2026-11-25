"use client";
import { FormError } from "@/components/form-error";

import Link from "next/link";
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createBankTransferAction } from "./actions";
import { bankTransferInputSchema, type BankTransferInput } from "./bank-transfer-input";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { FieldError } from "@/components/ui/field-error";
import { fieldErrorProps, fieldErrorId, applyServerFieldErrors, focusFirstInvalidField } from "@/lib/form-errors";

export function BankTransferForm({ businessId, accounts, initial }: { businessId: string; accounts: { id: string; name: string; currency_code: string }[]; initial: BankTransferInput }) {
  const [serverError, setServerError] = useState("");
  const form = useForm<BankTransferInput>({ resolver: zodResolver(bankTransferInputSchema), defaultValues: initial });
  const { register, control, handleSubmit, setError, formState: { errors, isSubmitting, isDirty, isSubmitSuccessful } } = form;
  useUnsavedChanges(isDirty && !isSubmitSuccessful);
  const accountOptions = accounts.map((a) => ({ value: a.id, label: `${a.name} · ${a.currency_code}` }));
  async function save(values: BankTransferInput) {
    setServerError(""); const result = await createBankTransferAction(businessId, values);
    if (result.fieldErrors) applyServerFieldErrors(setError, result.fieldErrors);
    if (result.error) setServerError(result.error);
  }
  return <form onSubmit={handleSubmit(save, focusFirstInvalidField)} className="space-y-7" noValidate>
    {serverError && <FormError message={serverError} />}
    <section className="border-b border-border pb-7"><h2 className="text-base font-semibold">Transfer details</h2><p className="mt-1 text-sm text-muted-foreground">One source document posts a debit to the destination and a credit to the source.</p><div className="mt-5 grid items-end gap-4 md:grid-cols-[1fr_auto_1fr]">
      <div className="space-y-1.5"><Label htmlFor="fromBankAccountId">From Account</Label><Controller control={control} name="fromBankAccountId" render={({ field }) => <Combobox ref={field.ref} id="fromBankAccountId" options={accountOptions} value={field.value ?? ""} onValueChange={field.onChange} placeholder="Choose source…" searchPlaceholder="Search accounts…" emptyText="No accounts found." ariaInvalid={!!errors.fromBankAccountId} ariaDescribedBy={errors.fromBankAccountId ? fieldErrorId("fromBankAccountId") : undefined} />} /><FieldError name="fromBankAccountId" message={errors.fromBankAccountId?.message} /></div><ArrowRight className="mb-2 hidden size-5 text-muted-foreground md:block" /><div className="space-y-1.5"><Label htmlFor="toBankAccountId">To Account</Label><Controller control={control} name="toBankAccountId" render={({ field }) => <Combobox ref={field.ref} id="toBankAccountId" options={accountOptions} value={field.value ?? ""} onValueChange={field.onChange} placeholder="Choose destination…" searchPlaceholder="Search accounts…" emptyText="No accounts found." ariaInvalid={!!errors.toBankAccountId} ariaDescribedBy={errors.toBankAccountId ? fieldErrorId("toBankAccountId") : undefined} />} /><FieldError name="toBankAccountId" message={errors.toBankAccountId?.message} /></div>
    </div><div className="mt-5 grid gap-5 sm:grid-cols-3">
      <div className="space-y-1.5">
        <Label htmlFor="date">Date</Label>
        <Input id="date" type="date" {...register("date")} {...fieldErrorProps("date", errors.date)} />
        <FieldError name="date" message={errors.date?.message} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="amount">Amount</Label>
        <Input id="amount" inputMode="decimal" {...register("amount")} {...fieldErrorProps("amount", errors.amount)} />
        <FieldError name="amount" message={errors.amount?.message} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="reference">Reference <span className="font-normal text-muted-foreground">(optional)</span></Label>
        <Input id="reference" {...register("reference")} {...fieldErrorProps("reference", errors.reference)} />
        <FieldError name="reference" message={errors.reference?.message} />
      </div>
      <div className="space-y-1.5 sm:col-span-3">
        <Label htmlFor="description">Description <span className="font-normal text-muted-foreground">(optional)</span></Label>
        <Input id="description" {...register("description")} {...fieldErrorProps("description", errors.description)} />
        <FieldError name="description" message={errors.description?.message} />
      </div>
    </div></section>
    <div className="sticky bottom-0 z-20 -mx-4 flex justify-between border-t border-border bg-surface/95 px-4 py-3 backdrop-blur-sm sm:mx-0 sm:rounded-t-lg sm:border-x"><Button asChild variant="ghost"><Link href={`/b/${businessId}/banking/accounts`}>Cancel</Link></Button><Button permission="create" type="submit" disabled={isSubmitting}>{isSubmitting && <LoaderCircle className="size-4 animate-spin" />} Post Transfer</Button></div>
  </form>;
}
