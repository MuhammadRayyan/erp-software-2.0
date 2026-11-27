import { notFound } from "next/navigation";
import { requireModule } from "@/core/permissions/require-module";
import { getBusinessDb } from "@/core/db/business";
import { BankAccountForm } from "@/modules/banking/bank-account-form";
import { bankAccountToInput, getBankAccount, isBankAccountCurrencyLocked, listBankLedgerOptions } from "@/modules/banking/bank-account-service";
import { listCurrencies } from "@/modules/currency/currency";
import { Breadcrumbs } from "@/components/breadcrumbs";

export default async function EditBankAccountPage({ params }: { params: Promise<{ businessId: string; accountId: string }> }) {
  const { businessId, accountId } = await params; const { user, access } = await requireModule(businessId, "banking"); const account = getBankAccount(businessId, user.id, accountId); if (!account) notFound();
  const currencies = listCurrencies(getBusinessDb(businessId, user.id).sqlite, true).map((currency) => ({ code: currency.code, name: currency.name }));
  return <div className="page-container"><Breadcrumbs businessId={businessId} items={[{ label: "Bank Accounts", href: `/b/${businessId}/banking/accounts` }, { label: account.name, href: `/b/${businessId}/banking/accounts/${accountId}` }, { label: "Edit" }]} /><div className="page-header"><div><h1 className="page-title">Edit Bank Account</h1><p className="page-description">Changing the mapped GL account changes the source of the displayed Book Balance.</p></div></div><BankAccountForm businessId={businessId} accountId={accountId} ledgerAccounts={listBankLedgerOptions(businessId, user.id, accountId)} currencies={currencies} baseCurrency={access.business.currency} currencyLocked={isBankAccountCurrencyLocked(businessId, user.id, accountId)} initial={bankAccountToInput(account)} /></div>;
}
