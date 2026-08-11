"use client";

import { useState, useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { completeReconciliationAction, startReconciliationAction } from "./actions";
import { reconciliationInputSchema, type ReconciliationInput } from "./reconciliation-input";

export function ReconciliationStartForm({ businessId, accountId, initial }: { businessId: string; accountId: string; initial: ReconciliationInput }) {
  const [serverError, setServerError] = useState(""); const form = useForm<ReconciliationInput>({ resolver: zodResolver(reconciliationInputSchema), defaultValues: initial });
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = form;
  async function start(values: ReconciliationInput) { setServerError(""); const result = await startReconciliationAction(businessId, accountId, values); if (result.fieldErrors) for (const [field, messages] of Object.entries(result.fieldErrors)) setError(field as keyof ReconciliationInput, { message: messages[0] }); if (result.error) setServerError(result.error); }
  return <form onSubmit={handleSubmit(start)} className="max-w-2xl rounded-lg border border-border bg-surface-raised p-5" noValidate><h2 className="text-base font-semibold">Start reconciliation</h2><p className="mt-1 text-sm text-muted-foreground">Enter the statement endpoint. No ledger entries will be created or changed.</p>{serverError && <div role="alert" className="mt-4 rounded-md border border-danger/25 bg-danger/10 px-3 py-2 text-sm text-danger">{serverError}</div>}<div className="mt-5 grid gap-5 sm:grid-cols-2"><div className="space-y-1.5"><Label htmlFor="statementDate">Statement date</Label><Input id="statementDate" type="date" {...register("statementDate")} />{errors.statementDate && <p className="field-error">{errors.statementDate.message}</p>}</div><div className="space-y-1.5"><Label htmlFor="statementEndingBalance">Ending balance</Label><Input id="statementEndingBalance" inputMode="decimal" {...register("statementEndingBalance")} />{errors.statementEndingBalance && <p className="field-error">{errors.statementEndingBalance.message}</p>}</div></div><div className="mt-5 flex justify-end"><Button type="submit" disabled={isSubmitting}>{isSubmitting && <LoaderCircle className="size-4 animate-spin" />} Review reconciliation</Button></div></form>;
}

export function CompleteReconciliationButton({ businessId, accountId, reconciliationId, disabled }: { businessId: string; accountId: string; reconciliationId: string; disabled: boolean }) {
  const [error, setError] = useState(""); const [pending, startTransition] = useTransition(); const router = useRouter();
  function complete() { setError(""); startTransition(async () => { const result = await completeReconciliationAction(businessId, accountId, reconciliationId); if (result.error) setError(result.error); else router.push(`/b/${businessId}/banking/accounts/${accountId}?section=reconciliation&notice=Reconciliation completed`); }); }
  return <div className="text-right"><Button disabled={disabled || pending} onClick={complete}>{pending ? <LoaderCircle className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />} Complete Reconciliation</Button>{disabled && <p className="mt-1.5 text-xs text-muted-foreground">Difference must be zero before completion.</p>}{error && <p className="mt-1.5 text-xs text-danger">{error}</p>}</div>;
}
