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
    <div className="page-container max-w-5xl space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-description">Business accounting, document presentation, localized formatting, and security controls.</p>
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
