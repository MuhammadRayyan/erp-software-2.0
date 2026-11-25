import { notFound } from "next/navigation";
import { getCurrentSession, requireUser } from "@/core/auth/session";
import { getBusinessForUser } from "@/core/businesses/business-service";
import { getSystemDb } from "@/core/db/system";
import { userSettings } from "@/core/db/system-schema";
import { eq } from "drizzle-orm";
import { SettingsShell } from "@/components/settings-shell";
import { AppearanceForm } from "@/modules/appearance/appearance-form";

export default async function AppearanceSettingsPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const user = await requireUser();
  const access = getBusinessForUser(businessId, user.id);
  if (!access) notFound();

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
    <SettingsShell
      businessId={businessId}
      title="Appearance & Theme"
      description="Configure light/dark theme modes, global typography font families, and interface text scaling for your account."
    >
      <AppearanceForm initialFont={themeFont} initialSize={themeSize} />
    </SettingsShell>
  );
}
