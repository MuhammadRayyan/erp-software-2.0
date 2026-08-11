import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireModule } from "@/core/permissions/require-module";
import { minorToInput } from "@/modules/accounting/calculations/money";
import { getAccountingSettings } from "@/modules/accounting/services/accounting-settings-service";
import { listAccounts } from "@/modules/accounting/services/account-service";
import { getActiveTaxCodes } from "@/modules/accounting/services/tax-code-service";
import { listBankAccounts } from "@/modules/banking/bank-account-service";
import { BankTransactionForm } from "@/modules/banking/bank-transaction-form";
import { getStatementLine } from "@/modules/banking/statement-service";
import { listProjects } from "@/modules/projects/project-service";

export default async function NewBankTransactionPage({ params, searchParams }: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ accountId?: string; statementLineId?: string; type?: string }>;
}) {
  const { businessId } = await params; const query = await searchParams; const { user, access } = await requireModule(businessId, "banking");
  const bankAccounts = listBankAccounts(businessId, user.id, false); const accounts = listAccounts(businessId, user.id); const taxCodes = getActiveTaxCodes(businessId, user.id).filter((code) => code.vatCategory); const projects = listProjects(businessId, user.id).filter((p) => p.status !== "cancelled"); const settings = getAccountingSettings(businessId, user.id);
  const statementLine = query.statementLineId ? getStatementLine(businessId, user.id, query.statementLineId) : undefined;
  const type = statementLine ? (statementLine.amount_minor > 0 ? "money_in" : "money_out") : query.type === "money_in" ? "money_in" : "money_out";
  const bankAccountId = statementLine?.bank_account_id ?? (bankAccounts.some((account) => account.id === query.accountId) ? query.accountId! : bankAccounts[0]?.id ?? "");
  const defaultCounter = type === "money_out" ? settings.defaultPurchaseExpenseAccountId : accounts.find((account) => account.type === "income")?.id ?? "";
  const noTax = taxCodes.find((tax) => tax.vatCategory === "out_of_scope")?.id ?? taxCodes[0]?.id ?? "";
  const backHref = bankAccountId ? `/b/${businessId}/banking/accounts/${bankAccountId}` : `/b/${businessId}/banking/accounts`;
  const date = statementLine?.transaction_date ?? new Date().toISOString().slice(0, 10);
  return <div className="page-container max-w-[1200px]"><Link href={backHref} className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Bank Account</Link><div className="page-header"><div><h1 className="page-title">New Bank Transaction</h1><p className="page-description">Record non-AR/AP money in or out. Use Receipts and Supplier Payments for customer or supplier activity.</p></div></div><BankTransactionForm businessId={businessId} currency={access.business.currency} bankAccounts={bankAccounts.map((a) => ({ id: a.id, name: a.name, is_cash_account: a.is_cash_account }))} counterAccounts={accounts.map((a) => ({ id: a.id, code: a.code, name: a.name, type: a.type, subtype: a.subtype }))} taxCodes={taxCodes} projects={projects.map((p) => ({ id: p.id, code: p.code, name: p.name }))} initial={{ bankAccountId, date, taxDate: date, supplyEmirate: "", type, reference: statementLine?.reference ?? "", description: statementLine?.description ?? "", statementLineId: statementLine?.id ?? "", lines: [{ accountId: defaultCounter, taxCodeId: noTax, projectId: "", description: statementLine?.description ?? "", amount: statementLine ? minorToInput(Math.abs(statementLine.amount_minor)) : "0.00" }] }} /></div>;
}
