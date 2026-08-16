import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { AppShell } from "@/components/app-shell/app-shell";
import { requireUser } from "@/core/auth/session";
import { listBusinessesForUser, touchBusiness } from "@/core/businesses/business-service";
import { getBusinessAccess } from "@/core/permissions/permissions";
import { moduleForBusinessPath } from "@/core/permissions/module-access";
export default async function BusinessLayout({ children, params }: { children: React.ReactNode; params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const user = await requireUser();
  const access = getBusinessAccess(businessId, user.id);
  if (!access) notFound();

  const headersList = await headers();
  const pathname = headersList.get("x-pathname") || "";
  const requirement = moduleForBusinessPath(pathname);
  
  if (requirement && !access.modules.includes(requirement.module)) {
    redirect(`/b/${businessId}/forbidden?module=${requirement.module}`);
  }

  // touchBusiness has its own in-memory throttle to prevent DB thrashing
  touchBusiness(businessId, user.id);

  const businessList = listBusinessesForUser(user.id).map(({ business }) => ({ id: business.id, name: business.name }));
  return (
    <AppShell business={{ id: access.business.id, name: access.business.name }} businesses={businessList} modules={access.modules} user={{ name: user.name, email: user.email }}>
      {children}
    </AppShell>
  );
}
