"use client";

import Link from "next/link";
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle, Plus, Trash2 } from "lucide-react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney } from "@/core/format";
import { saveBankTransactionAction } from "./actions";
import { bankTransactionInputSchema, type BankTransactionInput } from "./bank-transaction-input";
import { emirateLabels, emirates } from "@/modules/tax/uae-vat-config";

const selectClass = "h-9 w-full rounded-[6px] border border-border-strong bg-surface-raised px-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring/25";

export function BankTransactionForm({ businessId, transactionId, bankAccounts, counterAccounts, taxCodes, projects, initial, currency }: {
  businessId: string; transactionId?: string; currency: string;
  bankAccounts: { id: string; name: string; is_cash_account: number }[];
  counterAccounts: { id: string; code: string; name: string; type: string; subtype: string }[];
  taxCodes: { id: string; name: string; rateBasisPoints: number; direction: string; vatCategory: string | null }[];
  projects: { id: string; code: string; name: string }[];
  initial: BankTransactionInput;
}) {
  const [serverError, setServerError] = useState("");
  const [intent, setIntent] = useState<"draft" | "post">("post");
  const form = useForm<BankTransactionInput>({ resolver: zodResolver(bankTransactionInputSchema), defaultValues: initial });
  const { register, control, handleSubmit, setError, formState: { errors, isSubmitting } } = form;
  const { fields, append, remove } = useFieldArray({ control, name: "lines" });
  const type = useWatch({ control, name: "type" });
  const watchedLines = useWatch({ control, name: "lines" });
  const total = watchedLines.reduce((sum, line) => sum + (Number(line?.amount) || 0), 0);
  async function save(values: BankTransactionInput) {
    setServerError("");
    const result = await saveBankTransactionAction(businessId, transactionId ?? null, intent, values);
    if (result.fieldErrors) for (const [field, messages] of Object.entries(result.fieldErrors)) {
      if (field !== "lines") setError(field as keyof BankTransactionInput, { message: messages[0] });
    }
    if (result.error) setServerError(result.error);
  }
  const accountOptions = counterAccounts.filter((account) => !["bank", "cash", "accounts_receivable", "accounts_payable"].includes(account.subtype));
  const defaultTax = taxCodes.find((tax) => tax.vatCategory === "out_of_scope")?.id ?? taxCodes[0]?.id ?? "";
  const availableTaxCodes = taxCodes.filter((tax) => [type === "money_in" ? "sales" : "purchases", "both"].includes(tax.direction) && tax.vatCategory !== "reverse_charge");
  return <form onSubmit={handleSubmit(save)} className="space-y-7" noValidate>
    {initial.statementLineId && <div className="rounded-md border border-info/25 bg-info/10 px-3 py-2.5 text-sm">This transaction is linked to an imported statement line. Its direction and total must remain an exact match.</div>}
    {serverError && <div role="alert" className="rounded-md border border-danger/25 bg-danger/10 px-3 py-2.5 text-sm text-danger">{serverError}</div>}
    <input type="hidden" {...register("statementLineId")} />
    <section className="border-b border-border pb-7"><h2 className="text-base font-semibold">Transaction details</h2><div className="mt-5 grid gap-5 md:grid-cols-3">
      <div className="space-y-1.5"><Label htmlFor="bankAccountId">Bank Account</Label><select id="bankAccountId" className={selectClass} {...register("bankAccountId")}><option value="">Choose account</option>{bankAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select>{errors.bankAccountId && <p className="field-error">{errors.bankAccountId.message}</p>}</div>
      <div className="space-y-1.5"><Label htmlFor="type">Direction</Label><select id="type" className={selectClass} {...register("type")}><option value="money_out">Money Out</option><option value="money_in">Money In</option></select></div>
      <div className="space-y-1.5"><Label htmlFor="date">Date</Label><Input id="date" type="date" {...register("date")} aria-invalid={!!errors.date} />{errors.date && <p className="field-error">{errors.date.message}</p>}</div>
      <div className="space-y-1.5"><Label htmlFor="taxDate">VAT tax date</Label><Input id="taxDate" type="date" {...register("taxDate")} aria-invalid={!!errors.taxDate} />{errors.taxDate && <p className="field-error">{errors.taxDate.message}</p>}</div>
      {type === "money_in" && <div className="space-y-1.5"><Label htmlFor="supplyEmirate">Supply Emirate</Label><select id="supplyEmirate" className={selectClass} {...register("supplyEmirate")}><option value="">Use business default</option>{emirates.map((emirate) => <option key={emirate} value={emirate}>{emirateLabels[emirate]}</option>)}</select></div>}
      <div className="space-y-1.5"><Label htmlFor="reference">Reference <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="reference" {...register("reference")} /></div>
      <div className="space-y-1.5 md:col-span-2"><Label htmlFor="description">Description</Label><Input id="description" {...register("description")} aria-invalid={!!errors.description} />{errors.description && <p className="field-error">{errors.description.message}</p>}</div>
    </div></section>
    <section><div className="flex items-start justify-between gap-4"><div><h2 className="text-base font-semibold">{type === "money_in" ? "Income allocation" : "Expense allocation"}</h2><p className="mt-1 text-sm text-muted-foreground">Amounts include tax. Project is applied only to the counter-account P&amp;L line.</p></div><Button type="button" variant="secondary" size="sm" onClick={() => append({ accountId: "", taxCodeId: defaultTax, projectId: "", description: "", amount: "0.00" })}><Plus className="size-4" /> Add line</Button></div>
      <div className="mt-4 space-y-3">{fields.map((field, index) => <div key={field.id} className="grid gap-3 rounded-md border border-border bg-surface px-3 py-3 md:grid-cols-[1.3fr_1.3fr_0.9fr_0.9fr_auto]">
        <div className="space-y-1"><Label className="text-xs">Description</Label><Input {...register(`lines.${index}.description`)} /></div>
        <div className="space-y-1"><Label className="text-xs">Counter account</Label><select className={selectClass} {...register(`lines.${index}.accountId`)}><option value="">Choose account</option>{accountOptions.map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</select></div>
        <div className="space-y-1"><Label className="text-xs">Tax</Label><select className={selectClass} {...register(`lines.${index}.taxCodeId`)}>{availableTaxCodes.map((tax) => <option key={tax.id} value={tax.id}>{tax.name}</option>)}</select></div>
        <div className="space-y-1"><Label className="text-xs">Project</Label><select className={selectClass} {...register(`lines.${index}.projectId`)}><option value="">No Project</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.code} · {project.name}</option>)}</select></div>
        <div className="flex items-end gap-1"><div className="space-y-1"><Label className="text-xs">Amount incl. tax</Label><Input className="w-32 text-right tabular" inputMode="decimal" {...register(`lines.${index}.amount`)} /></div><Button type="button" variant="ghost" size="icon" aria-label={`Remove line ${index + 1}`} disabled={fields.length === 1} onClick={() => remove(index)}><Trash2 className="size-4" /></Button></div>
      </div>)}</div>
      {errors.lines?.root?.message && <p className="field-error">{errors.lines.root.message}</p>}
      <div className="mt-4 flex justify-end"><div className="min-w-64 border-t border-border pt-3 text-sm"><div className="flex justify-between gap-6"><span className="text-muted-foreground">Transaction total</span><span className="money font-semibold">{formatMoney(Math.round(total * 100), currency)}</span></div></div></div>
    </section>
    <div className="sticky bottom-0 z-20 -mx-4 flex justify-between border-t border-border bg-surface/95 px-4 py-3 backdrop-blur-sm sm:mx-0 sm:rounded-t-lg sm:border-x"><Button asChild variant="ghost"><Link href={transactionId ? `/b/${businessId}/banking/transactions/${transactionId}` : `/b/${businessId}/banking/accounts/${initial.bankAccountId}`}>Cancel</Link></Button><div className="flex gap-2"><Button type="submit" variant="secondary" disabled={isSubmitting || !!initial.statementLineId} onClick={() => setIntent("draft")}>Save Draft</Button><Button type="submit" disabled={isSubmitting} onClick={() => setIntent("post")}>{isSubmitting && <LoaderCircle className="size-4 animate-spin" />} Post Transaction</Button></div></div>
  </form>;
}
