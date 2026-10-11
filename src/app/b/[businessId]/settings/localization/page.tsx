import { requireModule } from "@/core/permissions/require-module";
import { SettingsShell } from "@/components/settings-shell";
import { getBusinessProfile } from "@/modules/business-profile/business-profile-service";
import { LocalizationForm } from "@/modules/business-profile/localization-form";

export const metadata = {
  title: "Regional & Localization",
};

export default async function LocalizationSettingsPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const { user, access } = await requireModule(businessId, "settings");
  const profile = getBusinessProfile(businessId, user.id);
  const isAdmin = access.membership.role === "administrator";

  return (
    <SettingsShell
      businessId={businessId}
      title="Regional & Localization"
      description="Configure date and time display conventions, calendar formatting, and fiscal year boundaries."
    >
      <LocalizationForm
        businessId={businessId}
        initial={profile}
        isAdmin={isAdmin}
      />
    </SettingsShell>
  );
}
