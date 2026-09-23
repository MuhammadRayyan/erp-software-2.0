import Link from "next/link";
import { notFound } from "next/navigation";
import { requireModule } from "@/core/permissions/require-module";
import { getBankAccount } from "@/modules/banking/bank-account-service";
import { StatementImportWizard } from "@/modules/banking/statement-import-wizard";

export default async function ImportStatementPage({ params }: { params: Promise<{ businessId: string; accountId: string }> }) {
  const { businessId, accountId } = await params; const { user } = await requireModule(businessId, "banking");
  const account = getBankAccount(businessId, user.id, accountId); if (!account) notFound();
  if (account.is_cash_account) return <div className="page-container"><BackLink href={`/b/${businessId}/banking/accounts/${accountId}`}>{account.name}</BackLink><div className="rounded-lg border border-warning/30 bg-warning/10 p-5"><h1 className="text-lg font-semibold">Statement import unavailable</h1><p className="mt-1 text-sm text-muted-foreground">Cash accounts participate in the ledger and transfers but do not use statement import or reconciliation in Phase 5.</p></div></div>;
  return <div className="page-container"><BackLink href={`/b/${businessId}/banking/accounts/${accountId}?section=imported`}>{account.name}</BackLink><div className="page-header"><div><h1 className="page-title">Import Statement</h1><p className="page-description">Upload, map, preview, and import a base-currency CSV statement.</p></div></div><StatementImportWizard businessId={businessId} accountId={accountId} accountName={account.name} /></div>;
import { BackLink } from "@/components/back-link";
}
