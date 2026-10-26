import Link from "next/link";
import { ArrowRightLeft, Landmark, LineChart, Plus } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { DensityToggle } from "@/components/density-toggle";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/core/format";
import { requireModule } from "@/core/permissions/require-module";
import { listBankAccounts } from "@/modules/banking/bank-account-service";
import { BankAccountRowActions } from "@/modules/banking/bank-account-row-actions";

export const metadata = {
  title: "Bank Accounts",
};

export default async function BankAccountsPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const { user, access } = await requireModule(businessId, "banking");
  const accounts = listBankAccounts(businessId, user.id);

  return (
    <div className="page-container">
      <PageHeader
        title="Bank Accounts"
        description="Base-currency bank and cash accounts mapped directly to Asset ledger accounts."
      >
        <DensityToggle businessId={businessId} />
        <Button asChild variant="secondary">
          <Link href={`/b/${businessId}/reports/cash-flow-forecast`}>
            <LineChart className="size-4" /> Liquidity Forecast
          </Link>
        </Button>
        <Button permission="create" asChild variant="secondary">
          <Link href={`/b/${businessId}/banking/transfers/new`}>
            <ArrowRightLeft className="size-4" /> Transfer
          </Link>
        </Button>
        <Button permission="create" asChild>
          <Link href={`/b/${businessId}/banking/accounts/new`}>
            <Plus className="size-4" /> New Bank Account
          </Link>
        </Button>
      </PageHeader>

      {accounts.length ? (
        <div className="data-panel overflow-hidden">
          <div className="overflow-x-auto">
            <table className="data-table min-w-[900px]">
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Institution</th>
                  <th>Mapped GL</th>
                  <th>Currency</th>
                  <th className="text-right!">Book Balance</th>
                  <th className="text-right!">Statement Balance</th>
                  <th className="text-right!">Unmatched</th>
                  <th>Status</th>
                  <th className="w-16 text-right"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((account) => (
                  <tr key={account.id}>
                    <td>
                      <Link href={`/b/${businessId}/banking/accounts/${account.id}`} className="font-medium text-primary hover:underline">
                        {account.name}
                      </Link>
                      <span className="ml-2 text-xs text-muted-foreground">{account.is_cash_account ? "Cash" : "Bank"}</span>
                    </td>
                    <td>{account.is_cash_account ? "—" : account.bank_name || "—"}</td>
                    <td>
                      {account.ledger_name}
                    </td>
                    <td className="tabular">{account.currency_code}</td>
                    <td className="money text-right font-medium">{formatMoney(account.book_balance_minor, access.business.currency)}</td>
                    <td className="money text-right">
                      {account.statement_balance_minor === null ? "Not reconciled" : formatMoney(account.statement_balance_minor, access.business.currency)}
                    </td>
                    <td className="tabular text-right">{account.is_cash_account ? "—" : account.unreconciled_count}</td>
                    <td>
                      <StatusBadge status={account.is_active ? "active" : "inactive"} />
                    </td>
                    <td>
                      <BankAccountRowActions
                        businessId={businessId}
                        accountId={account.id}
                        accountName={account.name}
                        isCashAccount={Boolean(account.is_cash_account)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <EmptyState
          icon={<Landmark className="mx-auto mb-3 size-7 text-muted-foreground" />}
          title="No bank accounts yet"
          description="Map an existing Bank or Cash Asset account to begin."
          action={
            <Button permission="create" asChild>
              <Link href={`/b/${businessId}/banking/accounts/new`}>Create first Bank Account</Link>
            </Button>
          }
        />
      )}
    </div>
  );
}
