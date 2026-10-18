import { requireModule } from "@/core/permissions/require-module";
import { SettingsShell } from "@/components/settings-shell";
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
    <SettingsShell
      businessId={businessId}
      title="Opening Balances"
      description="Set starting ledger balances when onboarding from prior spreadsheets or legacy systems."
    >
      <OpeningBalancesForm
        businessId={businessId}
        initialData={data}
        currency={access.business.currency}
      />
    </SettingsShell>
  );
}

