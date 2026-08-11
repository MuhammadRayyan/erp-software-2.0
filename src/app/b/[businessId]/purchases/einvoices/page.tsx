import Link from "next/link";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireModule } from "@/core/permissions/require-module";
import { formatDate, formatMoney } from "@/core/format";
import { MockInboundInjector } from "@/modules/inbound-einvoicing/inbound-controls";
import { listInboundEInvoices } from "@/modules/inbound-einvoicing/inbound-service";
import { listActiveSuppliers } from "@/modules/suppliers/supplier-service";

const statuses = ["NeedsSupplier", "NeedsReview", "ReadyForDraft", "DraftCreated", "ValidationFailed", "Processed", "Rejected", "Archived"] as const;
const labels: Record<string, string> = {
  NeedsSupplier: "Needs Supplier",
  NeedsReview: "Needs Review",
  ReadyForDraft: "Ready for Draft",
  DraftCreated: "Draft Created",
  ValidationFailed: "Validation Failed",
  Processed: "Processed",
  Rejected: "Rejected",
  Archived: "Archived",
  Received: "Received",
  Validated: "Validated",
};
const tones: Record<string, "neutral" | "info" | "warning" | "success" | "danger"> = {
  NeedsSupplier: "warning",
  NeedsReview: "warning",
  ReadyForDraft: "success",
  DraftCreated: "info",
  ValidationFailed: "danger",
  Processed: "success",
  Rejected: "danger",
  Archived: "neutral",
  Received: "info",
  Validated: "info",
};

export default async function SupplierEInvoiceInboxPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ status?: string; q?: string; supplierId?: string; from?: string; to?: string }>;
}) {
  const { businessId } = await params;
  const query = await searchParams;
  const { user, access } = await requireModule(businessId, "purchases");
  const status = statuses.includes(query.status as (typeof statuses)[number]) ? query.status : undefined;
  const suppliers = listActiveSuppliers(businessId, user.id);
  const supplierId = suppliers.some((supplier) => supplier.id === query.supplierId) ? query.supplierId : undefined;
  const rows = listInboundEInvoices(businessId, user.id, { status, search: query.q, supplierId, dateFrom: query.from, dateTo: query.to });
  return <div className="page-container max-w-[1320px] space-y-5">
    <div className="page-header"><div><h1 className="page-title">Supplier eInvoices</h1><p className="page-description">Receive, validate, match, and review PINT-AE supplier documents. Receipt never posts accounting.</p></div></div>
    <MockInboundInjector businessId={businessId} />
    <section className="data-panel">
      <form className="grid gap-3 border-b border-border p-3 sm:grid-cols-2 xl:grid-cols-[minmax(240px,1fr)_180px_180px_150px_150px_auto]" method="get"><div className="relative"><Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" /><input name="q" defaultValue={query.q ?? ""} placeholder="Search supplier, invoice or UUID…" className="h-9 w-full rounded-md border border-border-strong bg-surface-raised pr-3 pl-9 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring/25" /></div><select name="status" defaultValue={status ?? ""} className="h-9 rounded-md border border-border-strong bg-surface-raised px-2.5 text-sm outline-none focus:border-primary"><option value="">All statuses</option>{statuses.map((value) => <option key={value} value={value}>{labels[value]}</option>)}</select><select name="supplierId" defaultValue={supplierId ?? ""} className="h-9 rounded-md border border-border-strong bg-surface-raised px-2.5 text-sm outline-none focus:border-primary"><option value="">All Suppliers</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select><input aria-label="Received from" type="date" name="from" defaultValue={query.from ?? ""} className="h-9 rounded-md border border-border-strong bg-surface-raised px-2.5 text-sm outline-none focus:border-primary" /><input aria-label="Received to" type="date" name="to" defaultValue={query.to ?? ""} className="h-9 rounded-md border border-border-strong bg-surface-raised px-2.5 text-sm outline-none focus:border-primary" /><Button type="submit" size="sm" variant="secondary">Filter</Button></form>
      {rows.length ? <div className="overflow-x-auto"><table className="data-table min-w-[920px]"><thead><tr><th>Received</th><th>Supplier</th><th>Invoice</th><th>Date</th><th className="text-right!">Total</th><th>Provider</th><th>Status</th></tr></thead><tbody>{rows.map((row) => <tr key={String(row.id)}><td className="text-muted-foreground">{formatDate(String(row.received_at).slice(0, 10))}</td><td><span className="font-medium">{String(row.supplier_name ?? row.seller_legal_name)}</span>{!row.supplier_id && <span className="mt-0.5 block text-xs text-warning">Unconfirmed Supplier</span>}</td><td><Link href={`/b/${businessId}/purchases/einvoices/${row.id}`} className="tabular font-medium text-primary hover:underline">{String(row.document_number)}</Link><span className="mt-0.5 block text-xs capitalize text-muted-foreground">{String(row.document_type).replace("_", " ")}</span></td><td>{formatDate(String(row.issue_date))}</td><td className="money text-right">{formatMoney(Number(row.total_minor), String(row.currency_code ?? access.business.currency))}</td><td><Badge tone="info">MOCK</Badge></td><td><Badge tone={tones[String(row.status)] ?? "neutral"}>{labels[String(row.status)] ?? String(row.status)}</Badge>{row.purchase_invoice_number && <Link href={`/b/${businessId}/purchases/invoices/${row.purchase_invoice_id}`} className="mt-1 block text-xs text-primary hover:underline">{String(row.purchase_invoice_number)}</Link>}</td></tr>)}</tbody></table></div> : <div className="p-10 text-center"><p className="text-sm font-medium">No inbound supplier eInvoices</p><p className="mt-1 text-sm text-muted-foreground">Inject a clearly labelled Mock fixture to exercise the Phase 8 review flow.</p></div>}
    </section>
  </div>;
}
