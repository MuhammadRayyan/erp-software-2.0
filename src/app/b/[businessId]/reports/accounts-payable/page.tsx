import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireModule } from "@/core/permissions/require-module";
import { formatDate, formatMoney } from "@/core/format";
import { getCurrencySettings } from "@/modules/currency/exchange-rate";
import { getAccountsPayable } from "@/modules/reports/report-service";

export default async function AccountsPayablePage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const { user, access } = await requireModule(businessId, "reports");
  const rows = getAccountsPayable(businessId, user.id);
  const settings = getCurrencySettings(businessId, user.id);
  const minorUnits = new Map(settings.currencies.map((currency) => [currency.code, currency.minor_unit]));
  const totalBase = rows.reduce((sum, row) => sum + row.base_carrying_minor, 0);
  return <div className="page-container page-wide">
    <Link href={`/b/${businessId}/reports`} className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Reports</Link>
    <div className="page-header"><div><h1 className="page-title">Accounts Payable</h1><p className="page-description">Foreign open amounts stay in document currency; carrying amounts and totals are shown in {access.business.currency}.</p></div></div>
    {rows.length ? <div className="data-panel overflow-x-auto"><table className="data-table min-w-[940px]"><thead><tr><th>Supplier</th><th>Document</th><th>Due</th><th>Age</th><th className="text-right!">Foreign open</th><th className="text-right!">Base carrying</th></tr></thead><tbody>{rows.map((row) => <tr key={row.document_id}><td><Link href={`/b/${businessId}/suppliers/${row.supplier_id}`} className="font-medium text-primary hover:underline">{row.supplier_name}</Link></td><td className="tabular">{row.document_number}</td><td>{formatDate(row.due_date)}</td><td>{row.age_bucket}</td><td className="money text-right">{formatMoney(row.foreign_open_minor, row.currency_code, minorUnits.get(row.currency_code) ?? 2)}</td><td className="money text-right font-medium">{formatMoney(row.base_carrying_minor, access.business.currency)}</td></tr>)}</tbody><tfoot><tr className="border-t border-border-strong bg-surface font-semibold"><td className="h-11 px-3" colSpan={5}>Total base carrying amount</td><td className="money h-11 px-3 text-right">{formatMoney(totalBase, access.business.currency)}</td></tr></tfoot></table></div> : <div className="rounded-lg border border-border bg-surface py-10 text-center"><p className="font-medium">No outstanding payables</p><p className="mt-1 text-sm text-muted-foreground">Posted purchase invoices with a remaining foreign or base carrying balance appear here.</p></div>}
  </div>;
}
