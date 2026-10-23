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
  const { user, access } = await requireModule(businessId, "settings");

  if (access.membership.role !== "administrator") {
    return (
      <div className="page-container">
        <p className="text-muted-foreground text-sm">Administrator access is required to modify financial lock dates.</p>
      </div>
    );
  }

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

