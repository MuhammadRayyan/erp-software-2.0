import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { requireModule } from "@/core/permissions/require-module";
import { listVatReviewItems } from "@/modules/tax/vat-report-service";

function sourceHref(businessId: string, type: string, id: string) {
  if (type === "sales_invoice") return `/b/${businessId}/sales/invoices/${id}/edit`;
  if (type === "sales_credit_note") return `/b/${businessId}/sales/credit-notes/${id}/edit`;
  if (type === "purchase_invoice") return `/b/${businessId}/purchases/invoices/${id}/edit`;
  if (type === "bank_transaction") return `/b/${businessId}/banking/transactions/${id}`;
  return "#";
}

export default async function VatReviewPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const { user } = await requireModule(businessId, "reports");
  const rows = listVatReviewItems(businessId, user.id);
  return <div className="page-container"><Link href={`/b/${businessId}/tax/vat`} className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> VAT working papers</Link><div className="page-header"><div><h1 className="page-title">VAT Data Review</h1><p className="page-description">Ambiguous historical 0% data and missing reporting classifications are flagged here. The migration never guesses their treatment.</p></div><Badge tone={rows.length ? "warning" : "success"}>{rows.length ? `${rows.length} Needs Review` : "No open issues"}</Badge></div><div className="data-panel overflow-x-auto"><table className="data-table min-w-[880px]"><thead><tr><th>Tax date</th><th>Document</th><th>Issue</th><th>Why it is flagged</th><th /></tr></thead><tbody>{rows.length ? rows.map((row) => <tr key={row.id}><td>{row.tax_date}</td><td className="font-medium">{row.source_number ?? row.source_type}</td><td><Badge tone="warning">{row.issue_type.replaceAll("_", " ")}</Badge></td><td className="max-w-lg text-muted-foreground">{row.details}</td><td className="text-right"><Link className="text-sm font-medium text-primary" href={sourceHref(businessId, row.source_type, row.source_id)}>Review source</Link></td></tr>) : <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">No historical VAT data needs review.</td></tr>}</tbody></table></div></div>;
}

