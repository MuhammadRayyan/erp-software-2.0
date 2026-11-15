import { SettingsShell } from "@/components/settings-shell";
import { hasActionPermission } from "@/core/permissions/permissions";
import { requireModule } from "@/core/permissions/require-module";
import { getHiddenNavPaths } from "@/modules/preferences/nav-customization-service";
import { NavCustomizationForm } from "@/modules/preferences/nav-customization-form";

export const metadata = {
  title: "Customize Navigation - Settings",
};

export default async function CustomizeNavigationPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const { user } = await requireModule(businessId, "settings");
  const hiddenPaths = getHiddenNavPaths(businessId, user.id);
  const canEdit = hasActionPermission(businessId, user.id, "settings", "edit");

  return (
    <SettingsShell
      businessId={businessId}
      title="Customize Modules"
      description="Show or hide modules and sub-tabs in the workspace navigation. Settings and Customize stay available."
      maxWidth="max-w-5xl"
    >
      <NavCustomizationForm
        businessId={businessId}
        initialHiddenPaths={hiddenPaths}
        canEdit={canEdit}
      />
    </SettingsShell>
  );
}
