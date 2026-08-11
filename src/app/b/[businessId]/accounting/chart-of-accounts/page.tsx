import { requireModule } from "@/core/permissions/require-module";
import { AccountManager } from "@/modules/accounting/components/account-manager";
import { listAccounts } from "@/modules/accounting/services/account-service";

export const metadata = { title: "Chart of Accounts" };

export default async function ChartOfAccountsPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const { user } = await requireModule(businessId, "accounting");
  const accounts = listAccounts(businessId, user.id);
  return (
    <div className="page-container max-w-[1180px]">
      <div className="page-header">
        <div>
          <h1 className="page-title">Chart of Accounts</h1>
          <p className="page-description">Business-local accounts used by automated postings and financial reports.</p>
        </div>
      </div>
      <AccountManager businessId={businessId} accounts={accounts} />
    </div>
  );
}
