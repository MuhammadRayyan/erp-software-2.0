import { requireModule } from "@/core/permissions/require-module";
import { SettingsShell } from "@/components/settings-shell";
import { getBusinessProfile } from "@/modules/business-profile/business-profile-service";
import { BusinessProfileForm } from "@/modules/business-profile/business-profile-form";

export const metadata = {
  title: "Business Profile & Branding",
};

export default async function BusinessProfileSettingsPage({
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
      title="Business Profile & Branding"
      description="Legal company details, registered address, tax identification, and corporate logo for document presentation."
    >
      <BusinessProfileForm
        businessId={businessId}
        initial={profile}
        isAdmin={isAdmin}
      />
    </SettingsShell>
  );
}
