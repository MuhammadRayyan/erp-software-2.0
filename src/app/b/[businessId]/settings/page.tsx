import { requireModule } from "@/core/permissions/require-module";
import { getBusinessProfile } from "@/modules/business-profile/business-profile-service";
import { getTaxSettings } from "@/modules/tax/tax-settings-service";
import { SettingsHubClient } from "./settings-hub-client";

export const metadata = {
  title: "Settings",
};

export default async function SettingsPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const { user } = await requireModule(businessId, "settings");
  const profile = getBusinessProfile(businessId, user.id);
  const tax = getTaxSettings(businessId, user.id);

  return (
    <div className="page-container max-w-6xl space-y-6">
      <div className="page-header mb-6">
        <div>
          <h1 className="page-title text-2xl sm:text-3xl font-bold tracking-tight text-foreground">Settings</h1>
          <p className="page-description mt-1 text-sm text-muted-foreground leading-relaxed">Business accounting, document presentation, localized formatting, and security controls.</p>
        </div>
      </div>
      <SettingsHubClient
        businessId={businessId}
        profile={profile}
        vatRegistered={tax.vatRegistered}
      />
    </div>
  );
}
