import { redirect } from "next/navigation";
import { requireUser } from "@/core/auth/session";
import { getBusinessAccess } from "@/core/permissions/permissions";

export default async function SettingsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const user = await requireUser();
  const access = getBusinessAccess(businessId, user.id);
  if (!access) {
    redirect("/businesses");
  }

  return <>{children}</>;
}
