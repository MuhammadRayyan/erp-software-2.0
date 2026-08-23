"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  addVatAdjustmentAction,
  createVatPeriodAction,
  fileVatPeriodExternallyAction,
  finalizeVatPeriodAction,
  prepareVatPeriodAction,
  reopenVatPeriodAction,
} from "./actions";
import { addDaysIso } from "./uae-vat-config";
import { SelectNative } from "@/components/ui/select-native";


export function NewVatPeriodForm({ businessId }: { businessId: string }) {
  const router = useRouter();
  const [values, setValues] = useState({ periodReference: "", startDate: "", endDate: "", filingDueDate: "", notes: "" });
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function create() {
    setPending(true);
    setError("");
    const result = await createVatPeriodAction(businessId, values);
    setPending(false);
    if (result.error) return setError(result.error);
    router.push(`/b/${businessId}/tax/vat/periods/${result.id}`);
  }

  return <section className="rounded-lg border border-border bg-surface-raised p-4">
    <h2 className="font-semibold">New explicit VAT period</h2>
    <p className="mt-1 text-sm text-muted-foreground">Enter the period assigned to the business. No monthly or quarterly cadence is assumed.</p>
    <div className="mt-4 grid gap-3 md:grid-cols-4">
      <div className="space-y-1"><Label htmlFor="vat-period-reference">Reference</Label><Input id="vat-period-reference" value={values.periodReference} onChange={(event) => setValues((current) => ({ ...current, periodReference: event.target.value }))} placeholder="Apr–Jun 2026" /></div>
      <div className="space-y-1"><Label htmlFor="vat-period-start">Start</Label><Input id="vat-period-start" type="date" value={values.startDate} onChange={(event) => setValues((current) => ({ ...current, startDate: event.target.value }))} /></div>
      <div className="space-y-1"><Label htmlFor="vat-period-end">End</Label><Input id="vat-period-end" type="date" value={values.endDate} onChange={(event) => setValues((current) => ({ ...current, endDate: event.target.value, filingDueDate: event.target.value ? addDaysIso(event.target.value, 28) : "" }))} /></div>
      <div className="space-y-1"><Label htmlFor="vat-period-due">Filing due</Label><Input id="vat-period-due" type="date" value={values.filingDueDate} onChange={(event) => setValues((current) => ({ ...current, filingDueDate: event.target.value }))} /></div>
    </div>
    {error && <p role="alert" className="field-error mt-3">{error}</p>}
    <div className="mt-4 flex justify-end"><Button type="button" onClick={create} disabled={pending}>{pending ? "Creating…" : "Create period"}</Button></div>
  </section>;
}

export function VatWorkflowControls({ businessId, periodId, status, isAdmin }: { businessId: string; periodId: string; status: string; isAdmin: boolean }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");
  const [filedAt, setFiledAt] = useState(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState("");
  const [pending, setPending] = useState(false);

  async function run(action: () => Promise<{ error?: string }>, success: string) {
    setPending(true);
    setError("");
    const result = await action();
    setPending(false);
    if (result.error) return setError(result.error);
    toast.success(success);
    router.refresh();
  }

  return <section className="rounded-lg border border-border bg-surface-raised p-4">
    <h2 className="font-semibold">Period workflow</h2>
    <p className="mt-1 text-sm text-muted-foreground">Finalization saves a snapshot and applies the VAT lock. Filing is recorded only as an external event.</p>
    <div className="mt-4 flex flex-wrap gap-2">
      {(["open", "reopened"].includes(status)) && <Button type="button" variant="secondary" disabled={pending} onClick={() => run(() => prepareVatPeriodAction(businessId, periodId), "Period marked Prepared.")}>Mark Prepared</Button>}
      {(["open", "prepared", "reopened"].includes(status)) && isAdmin && <Button type="button" disabled={pending} onClick={() => run(() => finalizeVatPeriodAction(businessId, periodId), "VAT period finalized and locked.")}>Finalize period</Button>}
    </div>
    {!isAdmin && <p className="mt-3 text-xs text-muted-foreground">Administrator access is required to finalize, reopen, file externally, or add manual adjustments.</p>}
    {(["finalized", "filed_externally"].includes(status)) && isAdmin && <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto] md:items-end"><div className="space-y-1"><Label htmlFor="vat-reopen-reason">Required reopening reason</Label><Input id="vat-reopen-reason" value={reason} onChange={(event) => setReason(event.target.value)} /></div><Button type="button" variant="secondary" disabled={pending} onClick={() => run(() => reopenVatPeriodAction(businessId, periodId, { reason }), "VAT period reopened.")}>Reopen period</Button></div>}
    {status === "finalized" && isAdmin && <div className="mt-5 border-t border-border pt-4">
      <h3 className="text-sm font-medium">Mark as Filed Externally</h3>
      <p className="mt-1 text-xs text-muted-foreground">This records filing performed outside this ERP. It does not submit anything to the FTA or EmaraTax.</p>
      <div className="mt-3 grid gap-3 md:grid-cols-[180px_1fr_auto] md:items-end">
        <div className="space-y-1"><Label htmlFor="vat-filed-at">External filing date</Label><Input id="vat-filed-at" type="date" value={filedAt} onChange={(event) => setFiledAt(event.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="vat-filing-reference">External filing reference <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="vat-filing-reference" value={reference} onChange={(event) => setReference(event.target.value)} /></div>
        <Button type="button" disabled={pending} onClick={() => run(() => fileVatPeriodExternallyAction(businessId, periodId, { filedAt, filingReference: reference }), "External filing record saved.")}>Mark as Filed Externally</Button>
      </div>
    </div>}
    {error && <p role="alert" className="field-error mt-3">{error}</p>}
  </section>;
}

export function VatAdjustmentForm({ businessId, periodId, disabled }: { businessId: string; periodId: string; disabled: boolean }) {
  const router = useRouter();
  const [values, setValues] = useState({ reportBucket: "output_vat_adjustment", amount: "0.00", vatAmount: "0.00", reason: "", reference: "" });
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  if (disabled) return null;

  async function add() {
    setPending(true);
    setError("");
    const result = await addVatAdjustmentAction(businessId, periodId, values);
    setPending(false);
    if (result.error) return setError(result.error);
    toast.success("VAT adjustment added with audit metadata.");
    setValues({ reportBucket: "output_vat_adjustment", amount: "0.00", vatAmount: "0.00", reason: "", reference: "" });
    router.refresh();
  }

  return <section className="rounded-lg border border-border bg-surface-raised p-4">
    <h2 className="font-semibold">Manual VAT adjustment</h2>
    <p className="mt-1 text-sm text-muted-foreground">Calculated figures remain unchanged; adjustments are shown separately in Return Total.</p>
    <div className="mt-4 grid gap-3 md:grid-cols-5">
      <div className="space-y-1"><Label htmlFor="vat-adjustment-type">Adjustment type</Label><SelectNative id="vat-adjustment-type"  value={values.reportBucket} onChange={(event) => setValues((current) => ({ ...current, reportBucket: event.target.value }))}><option value="output_vat_adjustment">Output VAT adjustment</option><option value="input_vat_adjustment">Input VAT adjustment</option></SelectNative></div>
      <div className="space-y-1"><Label htmlFor="vat-adjustment-net">Net amount</Label><Input id="vat-adjustment-net" value={values.amount} onChange={(event) => setValues((current) => ({ ...current, amount: event.target.value }))} inputMode="decimal" /></div>
      <div className="space-y-1"><Label htmlFor="vat-adjustment-vat">VAT amount</Label><Input id="vat-adjustment-vat" value={values.vatAmount} onChange={(event) => setValues((current) => ({ ...current, vatAmount: event.target.value }))} inputMode="decimal" /></div>
      <div className="space-y-1"><Label htmlFor="vat-adjustment-reason">Required reason</Label><Input id="vat-adjustment-reason" value={values.reason} onChange={(event) => setValues((current) => ({ ...current, reason: event.target.value }))} /></div>
      <div className="space-y-1"><Label htmlFor="vat-adjustment-reference">Reference <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="vat-adjustment-reference" value={values.reference} onChange={(event) => setValues((current) => ({ ...current, reference: event.target.value }))} /></div>
    </div>
    {error && <p role="alert" className="field-error mt-3">{error}</p>}
    <div className="mt-3 flex justify-end"><Button type="button" variant="secondary" disabled={pending} onClick={add}>Add adjustment</Button></div>
  </section>;
}
