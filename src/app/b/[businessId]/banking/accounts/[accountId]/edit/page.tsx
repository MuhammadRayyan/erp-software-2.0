import { notFound } from "next/navigation";
import { requireModule } from "@/core/permissions/require-module";
import { BankAccountForm } from "@/modules/banking/bank-account-form";
import { bankAccountToInput, getBankAccount, listBankLedgerOptions } from "@/modules/banking/bank-account-service";
import { BackLink } from "@/components/back-link";

export default async function EditBankAccountPage({ params }: { params: Promise<{ businessId: string; accountId: string }> }) {
  const { businessId, accountId } = await params; const { user } = await requireModule(businessId, "banking"); const account = getBankAccount(businessId, user.id, accountId); if (!account) notFound();
  return <div className="page-container"><BackLink href={`/b/${businessId}/banking/accounts/${accountId}`}>{account.name}</BackLink><div className="page-header"><div><h1 className="page-title">Edit Bank Account</h1><p className="page-description">Changing the mapped GL account changes the source of the displayed Book Balance.</p></div></div><BankAccountForm businessId={businessId} accountId={accountId} ledgerAccounts={listBankLedgerOptions(businessId, user.id, accountId)} initial={bankAccountToInput(account)} /></div>;
}
