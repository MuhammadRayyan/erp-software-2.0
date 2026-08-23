import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireModule } from "@/core/permissions/require-module";
import { formatDate, formatMoney } from "@/core/format";
import { journalSourceLabel } from "@/modules/accounting/journal-source";
import { getCurrencySettings } from "@/modules/currency/exchange-rate";
import { listCustomers } from "@/modules/customers/customer-service";
import { getCustomerStatement } from "@/modules/reports/customer-statement-service";
import { SelectNative } from "@/components/ui/select-native";


export default async function CustomerStatementPage({ params, searchParams }: { params: Promise<{ businessId: string }>; searchParams: Promise<{ customerId?: string; currency?: string }> }) {
  const { businessId } = await params;
  const query = await searchParams;
  const { user, access } = await requireModule(businessId, "reports");
  const customers = listCustomers(businessId, user.id);
  const selected = customers.find((customer) => customer.id === query.customerId);
  const settings = getCurrencySettings(businessId, user.id);
  const minorUnits = new Map(settings.currencies.map((currency) => [currency.code, currency.minor_unit]));
  const rows = selected ? getCustomerStatement(businessId, user.id, selected.id, query.currency || undefined) : [];
  return <div className="page-container page-wide">
    <Link href={`/b/${businessId}/reports`} className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Reports</Link>
    <div className="page-header"><div><h1 className="page-title">Customer Statement</h1><p className="page-description">Native movements and independent running balances per currency, with base carrying impact alongside.</p></div></div>
    <form className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-3"><label className="space-y-1 text-xs text-muted-foreground">Customer<SelectNative name="customerId" defaultValue={selected?.id ?? ""} className="mt-1 block text-foreground"><option value="">Choose a customer…</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</SelectNative></label><label className="space-y-1 text-xs text-muted-foreground">Currency<SelectNative name="currency" defaultValue={query.currency ?? ""} className="mt-1 block text-foreground"><option value="">All currencies</option>{settings.currencies.map((currency) => <option key={currency.code} value={currency.code}>{currency.code} — {currency.name}</option>)}</SelectNative></label><Button type="submit" variant="secondary">View statement</Button></form>
    {!selected ? <div className="rounded-lg border border-border bg-surface py-10 text-center"><p className="font-medium">Choose a customer</p><p className="mt-1 text-sm text-muted-foreground">The statement will show invoices, receipts, credits, and currency-safe running balances.</p></div> : rows.length ? <div className="data-panel overflow-x-auto"><div className="flex h-11 items-center border-b border-border px-4"><h2 className="font-semibold">{selected.name}</h2></div><table className="data-table min-w-[1080px]"><thead><tr><th>Date</th><th>Type</th><th>Reference</th><th>Currency</th><th className="text-right!">Debit</th><th className="text-right!">Credit</th><th className="text-right!">Running balance</th><th className="text-right!">Base carrying impact</th></tr></thead><tbody>{rows.map((row) => { const unit = minorUnits.get(row.currency_code) ?? 2; return <tr key={`${row.entry_number}-${row.source_type}`}><td>{formatDate(row.date)}</td><td>{journalSourceLabel(row.source_type)}</td><td className="tabular">{row.reference ?? row.entry_number}</td><td className="font-mono">{row.currency_code}</td><td className="money text-right">{row.debit_minor ? formatMoney(row.debit_minor, row.currency_code, unit) : "—"}</td><td className="money text-right">{row.credit_minor ? formatMoney(row.credit_minor, row.currency_code, unit) : "—"}</td><td className="money text-right font-medium">{formatMoney(row.balanceMinor, row.currency_code, unit)}</td><td className="money text-right text-muted-foreground">{formatMoney(row.base_debit_minor - row.base_credit_minor, access.business.currency)}</td></tr>; })}</tbody></table></div> : <div className="rounded-lg border border-border bg-surface py-10 text-center"><p className="font-medium">No posted activity for {selected.name}</p><p className="mt-1 text-sm text-muted-foreground">Try All currencies or choose a different customer.</p></div>}
  </div>;
}
