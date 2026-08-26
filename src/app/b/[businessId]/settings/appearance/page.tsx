import { requireModule } from "@/core/permissions/require-module";
import { getCurrentSession } from "@/core/auth/session";
import { getSystemDb } from "@/core/db/system";
import { userSettings } from "@/core/db/system-schema";
import { eq } from "drizzle-orm";
import { SettingsShell } from "@/components/settings-shell";
import { AppearanceForm } from "@/modules/appearance/appearance-form";

export default async function AppearanceSettingsPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  await requireModule(businessId, "settings");

  const session = await getCurrentSession();
  let themeFont = "inter";
  let themeSize = "normal";

  if (session?.user) {
    const settings = await getSystemDb()
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, session.user.id))
      .get();
    if (settings) {
      themeFont = settings.themeFont;
      themeSize = settings.themeSize;
    }
  }

  return (
    <SettingsShell businessId={businessId} title="Appearance Settings" description="Configure global font families and text scaling for your account.">
      <AppearanceForm initialFont={themeFont} initialSize={themeSize} />
    </SettingsShell>
  );
}
