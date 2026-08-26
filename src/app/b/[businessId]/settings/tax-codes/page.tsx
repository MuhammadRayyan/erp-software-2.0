import { SettingsShell } from "@/components/settings-shell";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireModule } from "@/core/permissions/require-module";
import { TaxCodeManager } from "@/modules/accounting/components/tax-code-manager";
import { listAccounts } from "@/modules/accounting/services/account-service";
import { listTaxCodes } from "@/modules/accounting/services/tax-code-service";

export default async function TaxCodesPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const { user } = await requireModule(businessId, "settings");
  const taxCodes = listTaxCodes(businessId, user.id);
  const liabilityAccounts = listAccounts(businessId, user.id).filter(
    (account) => account.isActive && account.type === "liability",
  );
  const assetAccounts = listAccounts(businessId, user.id).filter(
    (account) => account.isActive && account.type === "asset",
  );
  return (
    <SettingsShell businessId={businessId} title="Tax Codes" description="Explicit direction, VAT category, recoverability, and isolated control-account mappings.">
      <TaxCodeManager businessId={businessId} taxCodes={taxCodes} liabilityAccounts={liabilityAccounts} assetAccounts={assetAccounts} />
    </SettingsShell>
  );
}
