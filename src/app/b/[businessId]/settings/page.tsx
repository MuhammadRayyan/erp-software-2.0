import { requireModule } from "@/core/permissions/require-module";
import { getTaxSettings } from "@/modules/tax/tax-settings-service";
import { SettingsHubClient } from "./settings-hub-client";

export const metadata = {
  title: "Settings",
};

export default async function SettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams?: Promise<{ q?: string }>;
}) {
  const { businessId } = await params;
  const queryParams = searchParams ? await searchParams : {};
  const { user, access } = await requireModule(businessId, "settings");
  const tax = getTaxSettings(businessId, user.id);

  return (
    <div className="page-container max-w-5xl space-y-5">
      <div className="page-header mb-4">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-description">Company setup, tax, currencies, numbering, and user access.</p>
        </div>
      </div>
      <SettingsHubClient
        businessId={businessId}
        vatRegistered={tax.vatRegistered}
        isSuperAdmin={Boolean(user.isSuperAdmin)}
        isAdmin={access.membership.role === "administrator"}
        initialQuery={queryParams.q}
      />
    </div>
  );
}
