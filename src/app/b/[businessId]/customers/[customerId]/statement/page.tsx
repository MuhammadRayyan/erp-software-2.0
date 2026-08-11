import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { requireModule } from "@/core/permissions/require-module";
import { formatDate, formatMoney } from "@/core/format";
import { journalSourceLabel } from "@/modules/accounting/journal-source";
import { getCustomer } from "@/modules/customers/customer-service";
import { getCustomerStatement } from "@/modules/reports/customer-statement-service";

export default async function CustomerStatementPage({ params }: { params: Promise<{ businessId: string; customerId: string }> }) {
  const { businessId, customerId } = await params;
  const { user, access } = await requireModule(businessId, "sales");
  const customer = getCustomer(businessId, user.id, customerId);
  if (!customer) notFound();
  const rows = getCustomerStatement(businessId, user.id, customerId);
  return (
    <div className="page-container max-w-[1100px]">
      <Link href={`/b/${businessId}/customers/${customerId}`} className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> {customer.name}</Link>
      <div className="page-header"><div><h1 className="page-title">Customer Statement</h1><p className="page-description">{customer.name} · Posted Accounts Receivable activity</p></div></div>
      {rows.length ? <div className="data-panel overflow-x-auto"><table className="data-table min-w-[850px]"><thead><tr><th>Date</th><th>Type</th><th>Reference</th><th>Description</th><th className="text-right!">Debit</th><th className="text-right!">Credit</th><th className="text-right!">Running Balance</th></tr></thead><tbody>{rows.map((row) => <tr key={`${row.entry_number}-${row.source_type}`}><td>{formatDate(row.date)}</td><td>{journalSourceLabel(row.source_type)}</td><td className="tabular">{row.reference ?? row.entry_number}</td><td className="text-muted-foreground">{row.description}</td><td className="money text-right">{row.debit_minor ? formatMoney(row.debit_minor, access.business.currency) : "—"}</td><td className="money text-right">{row.credit_minor ? formatMoney(row.credit_minor, access.business.currency) : "—"}</td><td className="money text-right font-medium">{formatMoney(row.balanceMinor, access.business.currency)}</td></tr>)}</tbody></table></div> : <div className="rounded-lg border border-border bg-surface py-10 text-center"><p className="font-medium">No posted activity</p><p className="mt-1 text-sm text-muted-foreground">Draft invoices do not affect this statement.</p></div>}
    </div>
  );
}
