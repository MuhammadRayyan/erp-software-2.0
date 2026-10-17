import { requireModule } from "@/core/permissions/require-module";
import { SettingsShell } from "@/components/settings-shell";
import { listBankRules } from "@/modules/banking/bank-rule-service";
import { listAccounts } from "@/modules/accounting/services/account-service";
import { listTaxCodes } from "@/modules/accounting/services/tax-code-service";
import { listBankAccounts } from "@/modules/banking/bank-account-service";
import { BankRulesManager } from "./bank-rules-manager";

export const metadata = {
  title: "Bank Rules & Auto-Categorization",
};

export default async function BankRulesPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const { user } = await requireModule(businessId, "settings");

  const rules = listBankRules(businessId, user.id);
  const allAccounts = listAccounts(businessId, user.id);
  const activeAccounts = allAccounts
    .filter((a) => a.isActive)
    .map((a) => ({ id: a.id, name: a.name, type: a.type }));
  const taxCodes = listTaxCodes(businessId, user.id).filter((t) => t.isActive);
  const bankAccounts = listBankAccounts(businessId, user.id, false);

  return (
    <SettingsShell
      businessId={businessId}
      title="Bank Rules & Auto-Categorization"
      description="Automate general ledger debit/credit categorization, tax codes, and descriptions for recurring bank statement lines."
      maxWidth="max-w-5xl"
    >
      <BankRulesManager
        businessId={businessId}
        rules={rules}
        accounts={activeAccounts}
        taxCodes={taxCodes}
        bankAccounts={bankAccounts}
      />
    </SettingsShell>
  );
}
