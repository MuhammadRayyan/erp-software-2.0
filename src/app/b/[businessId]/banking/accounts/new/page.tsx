import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireModule } from "@/core/permissions/require-module";
import { BankAccountForm } from "@/modules/banking/bank-account-form";
import { listBankLedgerOptions } from "@/modules/banking/bank-account-service";

export default async function NewBankAccountPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params; const { user, access } = await requireModule(businessId, "banking");
  return <div className="page-container page-narrow"><Link href={`/b/${businessId}/banking/accounts`} className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Bank Accounts</Link><div className="page-header"><div><h1 className="page-title">New Bank Account</h1><p className="page-description">Create banking metadata and map it to one existing GL account.</p></div></div><BankAccountForm businessId={businessId} ledgerAccounts={listBankLedgerOptions(businessId, user.id)} initial={{ name: "", accountCode: "", bankName: "", accountNumberMasked: "", currencyCode: access.business.currency, ledgerAccountId: "", isCashAccount: false, isActive: true }} /></div>;
}
