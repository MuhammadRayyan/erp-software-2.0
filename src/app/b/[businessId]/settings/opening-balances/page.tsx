import { requireModule } from "@/core/permissions/require-module";
import { BackLink } from "@/components/back-link";
import { getOpeningBalances } from "@/modules/accounting/services/opening-balances-service";
import { OpeningBalancesForm } from "@/modules/accounting/components/opening-balances-form";

export const metadata = {
  title: "Opening Balances",
};

export default async function OpeningBalancesPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const { user, access } = await requireModule(businessId, "settings");
  const data = getOpeningBalances(businessId, user.id);

  return (
    <div className="page-container max-w-4xl space-y-6">
      <BackLink href={`/b/${businessId}/settings`}>Settings</BackLink>
      <div className="page-header">
        <div>
          <h1 className="page-title">Opening Balances</h1>
          <p className="page-description">
            Set starting ledger balances when onboarding from prior spreadsheets or legacy systems.
          </p>
        </div>
      </div>
      <OpeningBalancesForm
        businessId={businessId}
        initialData={data}
        currency={access.business.currency}
      />
    </div>
  );
}
