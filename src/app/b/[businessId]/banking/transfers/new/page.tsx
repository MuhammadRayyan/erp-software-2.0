import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireModule } from "@/core/permissions/require-module";
import { listBankAccounts } from "@/modules/banking/bank-account-service";
import { BankTransferForm } from "@/modules/banking/bank-transfer-form";

export default async function NewBankTransferPage({ params, searchParams }: { params: Promise<{ businessId: string }>; searchParams: Promise<{ fromAccountId?: string }> }) {
  const { businessId } = await params; const query = await searchParams; const { user } = await requireModule(businessId, "banking"); const accounts = listBankAccounts(businessId, user.id, false); const source = accounts.some((a) => a.id === query.fromAccountId) ? query.fromAccountId! : accounts[0]?.id ?? "";
  return <div className="page-container"><Link href={source ? `/b/${businessId}/banking/accounts/${source}` : `/b/${businessId}/banking/accounts`} className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Bank Accounts</Link><div className="page-header"><div><h1 className="page-title">New Bank Transfer</h1><p className="page-description">Move base currency between two Bank or Cash accounts in one balanced source document.</p></div></div>{accounts.length >= 2 ? <BankTransferForm businessId={businessId} accounts={accounts.map((a) => ({ id: a.id, name: a.name, currency_code: a.currency_code }))} initial={{ fromBankAccountId: source, toBankAccountId: accounts.find((a) => a.id !== source)?.id ?? "", date: new Date().toISOString().slice(0, 10), amount: "0.00", reference: "", description: "" }} /> : <div className="rounded-lg border border-warning/30 bg-warning/10 p-5"><h2 className="font-semibold">Two accounts are required</h2><p className="mt-1 text-sm text-muted-foreground">Create another active Bank or Cash account before posting a transfer.</p></div>}</div>;
}
