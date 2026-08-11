"use client";

import Link from "next/link";
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { useForm, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveBankAccountAction } from "./actions";
import { bankAccountInputSchema, type BankAccountInput } from "./bank-account-input";

const selectClass = "h-9 w-full rounded-[6px] border border-border-strong bg-surface-raised px-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring/25";

export function BankAccountForm({ businessId, accountId, ledgerAccounts, initial }: {
  businessId: string; accountId?: string;
  ledgerAccounts: { id: string; code: string; name: string; subtype: "bank" | "cash"; available: number }[];
  initial: BankAccountInput;
}) {
  const [serverError, setServerError] = useState("");
  const form = useForm<BankAccountInput>({ resolver: zodResolver(bankAccountInputSchema), defaultValues: initial });
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = form;
  const isCash = useWatch({ control: form.control, name: "isCashAccount" });
  async function save(values: BankAccountInput) {
    setServerError("");
    const result = await saveBankAccountAction(businessId, accountId ?? null, values);
    if (result.fieldErrors) for (const [field, messages] of Object.entries(result.fieldErrors)) {
      setError(field as keyof BankAccountInput, { message: messages[0] });
    }
    if (result.error) setServerError(result.error);
  }
  return <form onSubmit={handleSubmit(save)} className="space-y-7" noValidate>
    {serverError && <div role="alert" className="rounded-md border border-danger/25 bg-danger/10 px-3 py-2.5 text-sm text-danger">{serverError}</div>}
    <section className="border-b border-border pb-7"><h2 className="text-base font-semibold">Account details</h2><p className="mt-1 text-sm text-muted-foreground">The Book Balance always comes from the mapped Asset ledger account.</p><div className="mt-5 grid gap-5 sm:grid-cols-2">
      <div className="space-y-1.5"><Label htmlFor="name">Account name</Label><Input id="name" {...register("name")} aria-invalid={!!errors.name} />{errors.name && <p className="field-error">{errors.name.message}</p>}</div>
      <div className="space-y-1.5"><Label htmlFor="accountCode">Account code <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="accountCode" {...register("accountCode")} /></div>
      <div className="space-y-1.5"><Label htmlFor="bankName">Bank name <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="bankName" {...register("bankName")} disabled={isCash} /></div>
      <div className="space-y-1.5"><Label htmlFor="accountNumberMasked">Masked account number <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="accountNumberMasked" placeholder="•••• 1234" {...register("accountNumberMasked")} disabled={isCash} /></div>
      <div className="space-y-1.5"><Label htmlFor="currencyCode">Currency</Label><Input id="currencyCode" readOnly className="bg-surface-muted" {...register("currencyCode")} /><p className="text-xs text-muted-foreground">Base currency only in Phase 5.</p></div>
      <div className="space-y-1.5"><Label htmlFor="ledgerAccountId">Mapped GL account</Label><select id="ledgerAccountId" className={selectClass} {...register("ledgerAccountId")}><option value="">Choose account</option>{ledgerAccounts.filter((ledger) => ledger.available && (isCash ? ledger.subtype === "cash" : ledger.subtype === "bank")).map((ledger) => <option key={ledger.id} value={ledger.id}>{ledger.code} · {ledger.name}</option>)}</select>{errors.ledgerAccountId && <p className="field-error">{errors.ledgerAccountId.message}</p>}</div>
    </div></section>
    <div className="flex flex-wrap gap-5"><label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-[var(--primary)]" {...register("isCashAccount")} /> Cash account</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-[var(--primary)]" {...register("isActive")} /> Active</label></div>
    <div className="sticky bottom-0 z-20 -mx-4 flex justify-between border-t border-border bg-surface/95 px-4 py-3 backdrop-blur-sm sm:mx-0 sm:rounded-t-lg sm:border-x"><Button asChild variant="ghost"><Link href={accountId ? `/b/${businessId}/banking/accounts/${accountId}` : `/b/${businessId}/banking/accounts`}>Cancel</Link></Button><Button type="submit" disabled={isSubmitting}>{isSubmitting && <LoaderCircle className="size-4 animate-spin" />} {accountId ? "Save Changes" : "Create Bank Account"}</Button></div>
  </form>;
}
