import { requireModule } from "@/core/permissions/require-module";
import { SettingsShell } from "@/components/settings-shell";
import { getFinancialLockDate } from "@/modules/accounting/services/financial-lock-service";
import { FinancialLockForm } from "@/modules/accounting/components/financial-lock-form";

export const metadata = {
  title: "Financial Lock Date",
};

export default async function FinancialLockDatePage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const { user } = await requireModule(businessId, "settings");
  const lockDate = getFinancialLockDate(businessId, user.id);

  return (
    <SettingsShell
      businessId={businessId}
      title="Financial Lock Date"
      description="Close accounting periods to prevent unauthorized or accidental modifications to finalized books."
    >
      <FinancialLockForm businessId={businessId} currentLockDate={lockDate} />
    </SettingsShell>
  );
}

