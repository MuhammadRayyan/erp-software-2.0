import Link from "next/link";
import { requireModule } from "@/core/permissions/require-module";
import { BankAccountForm } from "@/modules/banking/bank-account-form";
import { listBankLedgerOptions } from "@/modules/banking/bank-account-service";
import { BackLink } from "@/components/back-link";

export default async function NewBankAccountPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params; const { user, access } = await requireModule(businessId, "banking");
  return <div className="page-container"><BackLink href={`/b/${businessId}/banking/accounts`}>Bank Accounts</BackLink><div className="page-header"><div><h1 className="page-title">New Bank Account</h1><p className="page-description">Create banking metadata and map it to one existing GL account.</p></div></div><BankAccountForm businessId={businessId} ledgerAccounts={listBankLedgerOptions(businessId, user.id)} initial={{ name: "", accountCode: "", bankName: "", accountNumberMasked: "", currencyCode: access.business.currency, ledgerAccountId: "", isCashAccount: false, isActive: true }} /></div>;
}
