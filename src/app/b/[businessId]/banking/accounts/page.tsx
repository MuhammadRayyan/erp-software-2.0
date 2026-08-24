import Link from "next/link";
import { ArrowRightLeft, Landmark, Plus } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/core/format";
import { requireModule } from "@/core/permissions/require-module";
import { listBankAccounts } from "@/modules/banking/bank-account-service";

export default async function BankAccountsPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params; const { user, access } = await requireModule(businessId, "banking");
  const accounts = listBankAccounts(businessId, user.id);
  return <div className="page-container"><div className="page-header"><div><h1 className="page-title">Bank Accounts</h1><p className="page-description">Base-currency bank and cash accounts mapped directly to Asset ledger accounts.</p></div><div className="flex gap-2"><Button asChild variant="secondary"><Link href={`/b/${businessId}/banking/transfers/new`}><ArrowRightLeft className="size-4" /> Transfer</Link></Button><Button asChild><Link href={`/b/${businessId}/banking/accounts/new`}><Plus className="size-4" /> New Bank Account</Link></Button></div></div>
    {accounts.length ? <div className="data-panel"><table className="data-table min-w-[900px]"><thead><tr><th>Account</th><th>Institution</th><th>Mapped GL</th><th>Currency</th><th className="text-right!">Book Balance</th><th className="text-right!">Statement Balance</th><th className="text-right!">Unmatched</th><th>Status</th></tr></thead><tbody>{accounts.map((account) => <tr key={account.id}><td><Link href={`/b/${businessId}/banking/accounts/${account.id}`} className="font-medium text-primary hover:underline">{account.name}</Link><span className="ml-2 text-xs text-muted-foreground">{account.is_cash_account ? "Cash" : account.account_code || "Bank"}</span></td><td>{account.is_cash_account ? "—" : account.bank_name || "—"}</td><td><span className="tabular text-muted-foreground">{account.ledger_code}</span> · {account.ledger_name}</td><td className="tabular">{account.currency_code}</td><td className="money text-right font-medium">{formatMoney(account.book_balance_minor, access.business.currency)}</td><td className="money text-right">{account.statement_balance_minor === null ? "Not reconciled" : formatMoney(account.statement_balance_minor, access.business.currency)}</td><td className="tabular text-right">{account.is_cash_account ? "—" : account.unreconciled_count}</td><td><Badge tone={account.is_active ? "success" : "neutral"}>{account.is_active ? "Active" : "Inactive"}</Badge></td></tr>)}</tbody></table></div> : <EmptyState icon={<Landmark className="mx-auto mb-3 size-8 text-muted-foreground" />} title="No bank accounts yet" description="Map an existing Bank or Cash Asset account to begin." action={<Button asChild><Link href={`/b/${businessId}/banking/accounts/new`}>Create first Bank Account</Link></Button>} />}
  </div>;
}
