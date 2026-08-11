import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireModule } from "@/core/permissions/require-module";
import { formatDate, formatMoney } from "@/core/format";
import { journalSourceLabel } from "@/modules/accounting/journal-source";
import { getCurrencySettings } from "@/modules/currency/exchange-rate";
import { getSupplierStatement } from "@/modules/reports/supplier-statement-service";
import { listSuppliers } from "@/modules/suppliers/supplier-service";

const selectClass = "h-9 min-w-56 rounded-[6px] border border-border-strong bg-surface-raised px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring/25";

export default async function SupplierStatementPage({ params, searchParams }: { params: Promise<{ businessId: string }>; searchParams: Promise<{ supplierId?: string; currency?: string }> }) {
  const { businessId } = await params;
  const query = await searchParams;
  const { user, access } = await requireModule(businessId, "reports");
  const suppliers = listSuppliers(businessId, user.id);
  const selected = suppliers.find((supplier) => supplier.id === query.supplierId);
  const settings = getCurrencySettings(businessId, user.id);
  const minorUnits = new Map(settings.currencies.map((currency) => [currency.code, currency.minor_unit]));
  const rows = selected ? getSupplierStatement(businessId, user.id, selected.id, query.currency || undefined) : [];
  return <div className="page-container max-w-[1180px]">
    <Link href={`/b/${businessId}/reports`} className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Reports</Link>
    <div className="page-header"><div><h1 className="page-title">Supplier Statement</h1><p className="page-description">Native movements and independent payable balances per currency, with base carrying impact alongside.</p></div></div>
    <form className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-3"><label className="space-y-1 text-xs text-muted-foreground">Supplier<select name="supplierId" defaultValue={selected?.id ?? ""} className={`${selectClass} mt-1 block text-foreground`}><option value="">Choose a supplier…</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label><label className="space-y-1 text-xs text-muted-foreground">Currency<select name="currency" defaultValue={query.currency ?? ""} className={`${selectClass} mt-1 block text-foreground`}><option value="">All currencies</option>{settings.currencies.map((currency) => <option key={currency.code} value={currency.code}>{currency.code} — {currency.name}</option>)}</select></label><Button type="submit" variant="secondary">View statement</Button></form>
    {!selected ? <div className="rounded-lg border border-border bg-surface py-10 text-center"><p className="font-medium">Choose a supplier</p><p className="mt-1 text-sm text-muted-foreground">The statement will show bills, payments, and currency-safe running balances.</p></div> : rows.length ? <div className="data-panel overflow-x-auto"><div className="flex h-11 items-center border-b border-border px-4"><h2 className="font-semibold">{selected.name}</h2></div><table className="data-table min-w-[1080px]"><thead><tr><th>Date</th><th>Type</th><th>Reference</th><th>Currency</th><th className="text-right!">Debit</th><th className="text-right!">Credit</th><th className="text-right!">Payable balance</th><th className="text-right!">Base carrying impact</th></tr></thead><tbody>{rows.map((row) => { const unit = minorUnits.get(row.currency_code) ?? 2; return <tr key={`${row.entry_number}-${row.source_type}`}><td>{formatDate(row.date)}</td><td>{journalSourceLabel(row.source_type)}</td><td className="tabular">{row.reference ?? row.entry_number}</td><td className="font-mono">{row.currency_code}</td><td className="money text-right">{row.debit_minor ? formatMoney(row.debit_minor, row.currency_code, unit) : "—"}</td><td className="money text-right">{row.credit_minor ? formatMoney(row.credit_minor, row.currency_code, unit) : "—"}</td><td className="money text-right font-medium">{formatMoney(row.balanceMinor, row.currency_code, unit)}</td><td className="money text-right text-muted-foreground">{formatMoney(row.base_credit_minor - row.base_debit_minor, access.business.currency)}</td></tr>; })}</tbody></table></div> : <div className="rounded-lg border border-border bg-surface py-10 text-center"><p className="font-medium">No posted activity for {selected.name}</p><p className="mt-1 text-sm text-muted-foreground">Try All currencies or choose a different supplier.</p></div>}
  </div>;
}
