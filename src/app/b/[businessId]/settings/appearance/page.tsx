import { requireModule } from "@/core/permissions/require-module";
import { getCurrentSession } from "@/core/auth/session";
import { getSystemDb } from "@/core/db/system";
import { userSettings } from "@/core/db/system-schema";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
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
    <div className="page-container page-medium">
      <Link href={`/b/${businessId}/settings`} className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Settings
      </Link>
      <div className="page-header">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="page-title">Appearance Settings</h1>
          </div>
          <p className="page-description">Configure global font families and text scaling for your account.</p>
        </div>
      </div>
      
      <AppearanceForm initialFont={themeFont} initialSize={themeSize} />
    </div>
  );
}
