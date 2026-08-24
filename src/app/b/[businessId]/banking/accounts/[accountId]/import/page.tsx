import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { requireModule } from "@/core/permissions/require-module";
import { getBankAccount } from "@/modules/banking/bank-account-service";
import { StatementImportWizard } from "@/modules/banking/statement-import-wizard";

export default async function ImportStatementPage({ params }: { params: Promise<{ businessId: string; accountId: string }> }) {
  const { businessId, accountId } = await params; const { user } = await requireModule(businessId, "banking");
  const account = getBankAccount(businessId, user.id, accountId); if (!account) notFound();
  if (account.is_cash_account) return <div className="page-container"><Link href={`/b/${businessId}/banking/accounts/${accountId}`} className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> {account.name}</Link><div className="rounded-lg border border-warning/30 bg-warning/10 p-5"><h1 className="text-lg font-semibold">Statement import unavailable</h1><p className="mt-1 text-sm text-muted-foreground">Cash accounts participate in the ledger and transfers but do not use statement import or reconciliation in Phase 5.</p></div></div>;
  return <div className="page-container"><Link href={`/b/${businessId}/banking/accounts/${accountId}?section=imported`} className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> {account.name}</Link><div className="page-header"><div><h1 className="page-title">Import Statement</h1><p className="page-description">Upload, map, preview, and import a base-currency CSV statement.</p></div></div><StatementImportWizard businessId={businessId} accountId={accountId} accountName={account.name} /></div>;
}
