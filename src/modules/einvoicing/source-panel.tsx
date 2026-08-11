import Link from "next/link";
import { Braces, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { EInvoiceValidationReport } from "./einvoice-types";
import { EInvoiceDocumentControls } from "./document-controls";
import { EInvoiceStatusBadge } from "./status-badge";
import type { getEInvoiceForSource } from "./einvoice-service";

type Document = NonNullable<ReturnType<typeof getEInvoiceForSource>>;

export function EInvoiceSourcePanel({ businessId, sourceType, sourceId, document }: { businessId: string; sourceType: "sales_invoice" | "sales_credit_note"; sourceId: string; document: Document | null }) {
  const status = document?.status ?? "NotPrepared";
  const validation = document?.validation as EInvoiceValidationReport | null | undefined;
  return <section className="mb-5 rounded-lg border border-border bg-surface-raised p-5" aria-labelledby="einvoice-heading">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><div className="flex flex-wrap items-center gap-2"><h2 id="einvoice-heading" className="text-base font-semibold">Electronic Invoice</h2><EInvoiceStatusBadge status={status} /></div><p className="mt-1 max-w-2xl text-sm text-muted-foreground">PINT-AE XML is generated and validated separately from the human-readable PDF. Provider failures never alter accounting.</p></div>
      {document && <div className="flex gap-2"><Button asChild size="sm" variant="ghost"><Link href={`/b/${businessId}/einvoicing/${document.id}`}><ExternalLink className="size-4" /> Details</Link></Button>{document.xmlPayload && <Button asChild size="sm" variant="secondary"><a href={`/api/businesses/${businessId}/einvoicing/${document.id}/xml`}><Braces className="size-4" /> XML</a></Button>}</div>}
    </div>
    {document && <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3"><div><dt className="text-xs text-muted-foreground">UUID</dt><dd className="mt-1 break-all font-mono text-xs">{document.uuid}</dd></div><div><dt className="text-xs text-muted-foreground">Specification</dt><dd className="mt-1">PINT-AE {document.specificationVersion}</dd></div><div><dt className="text-xs text-muted-foreground">SHA-256</dt><dd className="mt-1 break-all font-mono text-xs">{document.payloadHash ?? "Created after XML generation"}</dd></div></dl>}
    {validation?.issues?.length ? <div className="mt-4 rounded-md border border-danger/25 bg-danger/5 p-3"><p className="text-sm font-medium">Action required</p><ul className="mt-2 space-y-1 text-sm text-muted-foreground">{validation.issues.slice(0, 6).map((entry, index) => <li key={`${entry.ruleId}-${index}`}><span className="font-mono text-xs text-foreground">{entry.ruleId}</span> · {entry.message}</li>)}</ul>{validation.issues.length > 6 && <p className="mt-2 text-xs text-muted-foreground">Open Details for all {validation.issues.length} validation findings.</p>}</div> : null}
    {status === "Accepted" && <p className="mt-4 rounded-md border border-success/25 bg-success/10 px-3 py-2 text-sm text-success">Accepted snapshot locked. Use a Sales Credit Note or a new correction document; this XML will never be silently rewritten.</p>}
    <div className="mt-4"><EInvoiceDocumentControls businessId={businessId} sourceType={sourceType} sourceId={sourceId} documentId={document?.id ?? null} status={status} /></div>
  </section>;
}
