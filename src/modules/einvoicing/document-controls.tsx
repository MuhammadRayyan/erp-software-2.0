"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Send, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { prepareEInvoiceAction, submitEInvoiceAction } from "./actions";
import type { EInvoiceSourceType, EInvoiceStatus } from "./einvoice-types";

export function EInvoiceDocumentControls({
  businessId,
  sourceType,
  sourceId,
  documentId,
  status,
}: {
  businessId: string;
  sourceType: EInvoiceSourceType;
  sourceId: string;
  documentId: string | null;
  status: EInvoiceStatus;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [scenario, setScenario] = useState("accepted");

  function prepare() {
    setError("");
    startTransition(async () => {
      const result = await prepareEInvoiceAction(businessId, sourceType, sourceId);
      if (result.error) setError(result.error);
      router.refresh();
    });
  }

  function submit() {
    if (!documentId) return;
    setError("");
    startTransition(async () => {
      const result = await submitEInvoiceAction(businessId, documentId, scenario);
      if (result.error) setError(result.error);
      router.refresh();
    });
  }

  return <div className="space-y-3">
    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    <div className="flex flex-wrap items-end gap-2">
      {!(["Submitted", "Accepted", "Rejected"] as EInvoiceStatus[]).includes(status) && <Button type="button" variant="secondary" onClick={prepare} disabled={pending}>{pending ? <LoaderCircle className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />} {status === "NotPrepared" ? "Prepare & validate" : "Validate again"}</Button>}
      {(status === "Ready" || status === "Rejected") && documentId && <>
        <label className="space-y-1 text-xs text-muted-foreground"><span className="block">Mock outcome</span><select className="h-9 rounded-[6px] border border-border-strong bg-surface-raised px-2.5 text-sm text-foreground" value={scenario} onChange={(event) => setScenario(event.target.value)}><option value="accepted">Accepted</option><option value="provider_rejected">Provider rejected</option><option value="exchange_rejected">Exchange rejected</option><option value="reporting_rejected">Reporting rejected</option><option value="provider_error">Provider error</option></select></label>
        <Button type="button" onClick={submit} disabled={pending}>{pending ? <LoaderCircle className="size-4 animate-spin" /> : <Send className="size-4" />} {status === "Rejected" ? "Retry same snapshot" : "Submit to Mock ASP"}</Button>
      </>}
    </div>
  </div>;
}
