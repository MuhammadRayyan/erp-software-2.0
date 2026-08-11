import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell/app-shell";
import { requireUser } from "@/core/auth/session";
import { listBusinessesForUser, touchBusiness } from "@/core/businesses/business-service";
import { getBusinessAccess } from "@/core/permissions/permissions";

export default async function BusinessLayout({ children, params }: { children: React.ReactNode; params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const user = await requireUser();
  const access = getBusinessAccess(businessId, user.id);
  if (!access) notFound();
  touchBusiness(businessId, user.id);
  const businessList = listBusinessesForUser(user.id).map(({ business }) => ({ id: business.id, name: business.name }));
  return (
    <AppShell business={{ id: access.business.id, name: access.business.name }} businesses={businessList} modules={access.modules} user={{ name: user.name, email: user.email }}>
      {children}
    </AppShell>
  );
}
