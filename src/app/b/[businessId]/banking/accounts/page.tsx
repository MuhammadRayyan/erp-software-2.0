import Link from "next/link";
import { ArrowRightLeft, Landmark, LineChart, Plus } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { requireModule } from "@/core/permissions/require-module";
import { listBankAccounts } from "@/modules/banking/bank-account-service";
import { BankAccountTable, type BankAccountRow } from "@/modules/banking/bank-account-table";
import { listPreferences } from "@/modules/preferences/preference-service";
import { decodeColumnSnapshots } from "@/modules/preferences/snapshot-codec";

export const metadata = {
  title: "Bank Accounts",
};

export default async function BankAccountsPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const { user, access } = await requireModule(businessId, "banking");
  const accounts = listBankAccounts(businessId, user.id) as unknown as BankAccountRow[];
  const columnSnapshots = decodeColumnSnapshots(listPreferences(businessId, user.id));

  return (
    <div className="page-container">
      <PageHeader
        title="Bank Accounts"
        description="Bank and cash accounts mapped to ledger accounts."
      >
        <Button asChild variant="secondary">
          <Link href={`/b/${businessId}/banking/pdcs`}>
            <Landmark className="size-4" /> Post-Dated Cheques
          </Link>
        </Button>
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
        <BankAccountTable
          businessId={businessId}
          baseCurrency={access.business.currency}
          accounts={accounts}
          serverSnapshot={columnSnapshots["bank-accounts"]}
        />
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
