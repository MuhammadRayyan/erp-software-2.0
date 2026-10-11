import { requireModule } from "@/core/permissions/require-module";
import { BackLink } from "@/components/back-link";
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
    <div className="page-container max-w-4xl space-y-6">
      <BackLink href={`/b/${businessId}/settings`}>Settings</BackLink>
      <div className="page-header">
        <div>
          <h1 className="page-title">Financial Lock Date</h1>
          <p className="page-description">
            Close accounting periods to prevent unauthorized or accidental modifications to finalized books.
          </p>
        </div>
      </div>
      <FinancialLockForm businessId={businessId} currentLockDate={lockDate} />
    </div>
  );
}
