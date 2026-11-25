import { requireModule } from "@/core/permissions/require-module";
import { BankAccountForm } from "@/modules/banking/bank-account-form";
import { listBankLedgerOptions } from "@/modules/banking/bank-account-service";
import { Breadcrumbs } from "@/components/breadcrumbs";

export default async function NewBankAccountPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params; const { user, access } = await requireModule(businessId, "banking");
  return <div className="page-container"><Breadcrumbs businessId={businessId} items={[{ label: "Bank Accounts", href: `/b/${businessId}/banking/accounts` }, { label: "New Bank Account" }]} /><div className="page-header"><div><h1 className="page-title">New Bank Account</h1><p className="page-description">Create banking metadata and map it to one existing GL account.</p></div></div><BankAccountForm businessId={businessId} ledgerAccounts={listBankLedgerOptions(businessId, user.id)} initial={{ name: "", accountCode: "", bankName: "", accountNumberMasked: "", currencyCode: access.business.currency, ledgerAccountId: "", isCashAccount: false, isActive: true }} /></div>;
}
