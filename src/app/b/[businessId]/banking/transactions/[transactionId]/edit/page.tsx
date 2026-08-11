import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { requireModule } from "@/core/permissions/require-module";
import { listAccounts } from "@/modules/accounting/services/account-service";
import { getActiveTaxCodes } from "@/modules/accounting/services/tax-code-service";
import { listBankAccounts } from "@/modules/banking/bank-account-service";
import { BankTransactionForm } from "@/modules/banking/bank-transaction-form";
import { bankTransactionToInput, getBankTransaction } from "@/modules/banking/bank-transaction-service";
import { listProjects } from "@/modules/projects/project-service";

export default async function EditBankTransactionPage({ params }: { params: Promise<{ businessId: string; transactionId: string }> }) {
  const { businessId, transactionId } = await params; const { user, access } = await requireModule(businessId, "banking"); const record = getBankTransaction(businessId, user.id, transactionId); if (!record || record.transaction.document_status !== "draft") notFound();
  const accounts = listAccounts(businessId, user.id); const taxCodes = getActiveTaxCodes(businessId, user.id).filter((code) => code.vatCategory); const projects = listProjects(businessId, user.id).filter((p) => p.status !== "cancelled"); const bankAccounts = listBankAccounts(businessId, user.id, false);
  return <div className="page-container max-w-[1200px]"><Link href={`/b/${businessId}/banking/transactions/${transactionId}`} className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> {String(record.transaction.transaction_number)}</Link><div className="page-header"><div><h1 className="page-title">Edit Bank Transaction</h1><p className="page-description">Drafts have no ledger impact until posted.</p></div></div><BankTransactionForm businessId={businessId} transactionId={transactionId} currency={access.business.currency} bankAccounts={bankAccounts.map((a) => ({ id: a.id, name: a.name, is_cash_account: a.is_cash_account }))} counterAccounts={accounts.map((a) => ({ id: a.id, code: a.code, name: a.name, type: a.type, subtype: a.subtype }))} taxCodes={taxCodes} projects={projects.map((p) => ({ id: p.id, code: p.code, name: p.name }))} initial={bankTransactionToInput(record)} /></div>;
}
