import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requireModule } from "@/core/permissions/require-module";
import { formatMoney } from "@/core/format";
import { getTrialBalance } from "@/modules/reports/report-service";

export default async function TrialBalancePage({ params, searchParams }: { params: Promise<{ businessId: string }>; searchParams: Promise<{ throughDate?: string }> }) {
  const { businessId } = await params;
  const query = await searchParams;
  const { user, access } = await requireModule(businessId, "reports");
  const throughDate = query.throughDate ?? new Date().toISOString().slice(0, 10);
  const report = getTrialBalance(businessId, user.id, throughDate);
  const balanced = report.debitMinor === report.creditMinor;
  return (
    <div className="page-container">
      <Link href={`/b/${businessId}/reports`} className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Reports</Link>
      <div className="page-header"><div><h1 className="page-title">Trial Balance</h1><p className="page-description">Net account balances from all posted entries through the selected date.</p></div><Badge tone={balanced ? "success" : "danger"}>{balanced ? "Balanced" : "Out of balance"}</Badge></div>
      <form className="mb-3 flex flex-wrap items-end gap-3"><label className="space-y-1 text-xs text-muted-foreground">Through date<Input name="throughDate" type="date" defaultValue={throughDate} className="mt-1 w-44 text-foreground" /></label><Button type="submit" variant="secondary">Apply</Button></form>
      <div className="data-panel overflow-x-auto"><table className="data-table min-w-[620px]"><thead><tr><th>Account</th><th>Type</th><th className="text-right!">Debit</th><th className="text-right!">Credit</th></tr></thead><tbody>{report.accounts.map((account) => <tr key={account.id}><td><span className="tabular text-muted-foreground">{account.code}</span> <span className="font-medium">{account.name}</span></td><td className="capitalize text-muted-foreground">{account.type}</td><td className="money text-right">{account.debitMinor ? formatMoney(account.debitMinor, access.business.currency) : "—"}</td><td className="money text-right">{account.creditMinor ? formatMoney(account.creditMinor, access.business.currency) : "—"}</td></tr>)}</tbody><tfoot><tr className="border-t border-border-strong bg-surface font-semibold"><td colSpan={2} className="h-11 px-3">Total</td><td className="money h-11 px-3 text-right">{formatMoney(report.debitMinor, access.business.currency)}</td><td className="money h-11 px-3 text-right">{formatMoney(report.creditMinor, access.business.currency)}</td></tr></tfoot></table></div>
    </div>
  );
}
